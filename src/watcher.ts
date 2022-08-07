import { config } from "dotenv";

config();

import { join } from "path";
import { createReadStream, lstatSync, readdirSync, statSync } from "fs";
import { ConnectionStatus, SlpLiveStream, SlpRealTime } from "@vinceau/slp-realtime";
import { processReplay, Stats } from "./stats";
import { execCommand, execCommandWithResult, execDetached, sleep } from "./util";
import { updateReadme } from "./github"
import * as winston from "winston";
import { chdir, cwd } from "process";
import { GameMode, Ports } from "@slippi/slippi-js";
import OBSWebSocket from "obs-websocket-js";
import axios from "axios";
import FormData from "form-data";
import { unlink } from "fs/promises";

const AppName: string = "watcher";
const argv: string[] = process.argv.slice(2);
export const logger: winston.Logger = setupLogger();
// Log message
logger.log("info", `"${AppName}" started with ${argv.length ? argv.join("; ") : "no args"}`);

(() => {
  if (!process.env.SLIPPI_ACCOUNTS || !process.env.SLIPPI_REPLAYS || !process.env.GH_REPO_PATH
    || !process.env.GH_CONFIG_NAME || !process.env.GH_CONFIG_MAIL || !process.env.UNIQUE_KEY
    || !process.env.OBS_WS_PORT || !process.env.OBS_WS_PASSWORD || !process.env.OBS_PATH
    || !process.env.OBS_SCENE || !process.env.SERVER_URL) {
    logger.log("error", "Some .env variables where not defined");
    throw new Error("Some .env variables where not defined");
  }
})();

const ADDRESS = "127.0.0.1";
const OBS_EXE = "obs64.exe";
const SLIPPI_REPLAYS = process.env.SLIPPI_REPLAYS!;
const OBS_WS_PORT = process.env.OBS_WS_PORT!;
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD!;
const UNIQUE_KEY = process.env.UNIQUE_KEY!;
const OBS_PATH = process.env.OBS_PATH!;
const OBS_SCENE = process.env.OBS_SCENE!;
const SERVER_URL = process.env.SERVER_URL!;
const obs = new OBSWebSocket();
let lastReplay = "";
let slippiRunning = false;

(async () => {
  while (true) {
    while (!await isSlippiRunning()) {
      await onDolphinClose();
      await sleep(5000);
    }

    if (!slippiRunning) {
      await onDolphinStart();
    }

    await waitForReplayEnd();
    const stats = await processLatestReplay();

    if (stats) {
      await updateReadme(stats!);
    }
  }
})();

function setupLogger(): winston.Logger {
  // Logger init
  const { combine, timestamp, printf, label } = winston.format;
  const filename: string = `${AppName}.log`;
  const transports = {
    file: new winston.transports.File({ filename: filename })
  };

  transports.file.level = "debug";

  return winston.createLogger({
    level: "debug",
    format: combine(
      label({ label: "[my-label]" }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
      printf((info) => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`)
    ),
    transports: [transports.file]
  });
}

async function onObsStart() {
  try {
    await obs.connect(`ws://${ADDRESS}:${OBS_WS_PORT}`, OBS_WS_PASSWORD);
    await obs.on("RecordStateChanged", args => {
      // @ts-ignore
      if (args.outputState == "OBS_WEBSOCKET_OUTPUT_STOPPED" && args.outputPath) uploadVideo(args.outputPath);
    });
  } catch (e) {
    console.log("error", "Failed onObsStart: ", e);
    logger.log("error", "Failed onObsStart: " + e);
  }
}

async function onObsClose() {
  try {
    await obs.disconnect();
  } catch (e) {
    logger.log("error", "Unable to disconnect: " + e);
  }
}

async function onDolphinStart() {
  slippiRunning = true;
  await startObs();
}

async function onDolphinClose() {
  slippiRunning = false;
  await stopObs();
}

async function onGameEnd() {
  await stopObsRecording();
}

async function onGameStart() {
  await startObsRecording();
}

async function startObsRecording() {
  await obs.call("SetCurrentProgramScene", { sceneName: OBS_SCENE });
  await obs.call("StartRecord");
}

async function stopObsRecording() {
  await obs.call("StopRecord");
}

async function startObs() {
  const dir = cwd();

  chdir(OBS_PATH);
  try {
    await execDetached(join(OBS_PATH, OBS_EXE),
    [ "--multi", "--disable-updater", "--disable-missing-files-check", "--minimize-to-tray", `--scene "${OBS_SCENE}"` ]);
  } catch (e) {
    logger.info("error", "Failed to start OBS", e);
  }

  chdir(dir);
  sleep(10000).then(onObsStart).catch(console.error);
}

async function stopObs() {
  try {
    await execCommand("taskkill", ["/IM", "obs64.exe", "/F"])
    await onObsClose();
  } catch (e) {
    console.error("Failed to kill OBS", e);
  }
}

async function processLatestReplay(): Promise<Stats | null> {
  let slpFiles: string[] = [];
  slpFiles = getAllSlpFiles(SLIPPI_REPLAYS, slpFiles);
  const mostRecentReplay = getMostRecentSlpFile(slpFiles);

  if (!mostRecentReplay || mostRecentReplay == lastReplay) {
    return null;
  }

  lastReplay = mostRecentReplay;

  try {
    return processReplay(mostRecentReplay);
  } catch (err) {
    console.error("Unable to get game stats", err);
  }

  return null;
}

function getMostRecentSlpFile(slpFiles: string[]): string | null {
  const recentSlpFiles = slpFiles
    .map(file => ({ file, mtime: lstatSync(file).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return recentSlpFiles.length ? recentSlpFiles[0].file : null;
}

function getAllSlpFiles(directory: string, files: string[] = []): string[] {
  readdirSync(directory)
    .forEach(file => {
      const path = join(directory, file);

      if (statSync(path).isDirectory()) {
        files.concat(getAllSlpFiles(path, files));
      } else {
        if (!file.endsWith(".slp")) {
          return;
        }

        files.push(path);
      }
    });

  return files;
}

async function waitForReplayEnd() {
  let shouldKeepWaiting = true;
  const stream = new SlpLiveStream("dolphin"); //  { outputFiles: false } when +3.2.0 gets released

  stream.start(ADDRESS, Ports.DEFAULT)
    .then(() => console.log("Connected to Slippi"))
    .catch((err) => console.error("Unable to connect to Slippi", err));
  stream.connection.on("statusChange", (status) => {
    if (status === ConnectionStatus.DISCONNECTED) {
      shouldKeepWaiting = false
    }
  });

  const realtime = new SlpRealTime();

  realtime.setStream(stream);
  realtime.game.end$.subscribe((_) => {
    shouldKeepWaiting = false;
    onGameEnd();
  });

  realtime.game.start$.subscribe((gameStart) => {
    if (gameStart.gameMode != GameMode.ONLINE) {
      return;
    }

    onGameStart();
  });


  while (shouldKeepWaiting) {
    await sleep(1000);
  }

  stream.end();
}

async function isSlippiRunning(): Promise<boolean> {
    const result = await execCommandWithResult("tasklist");

    if (!result) {
      return false;
    }

    return result.includes("Slippi Dolphin.exe");
}

async function uploadVideo(videoPath: string) {
  const data = new FormData();

  data.append('video', createReadStream(videoPath));
  data.append('UNIQUE_KEY', UNIQUE_KEY);

  const config = {
    method: 'post',
    url: `${SERVER_URL}/uploadLastMatch`,
    headers: {
      ...data.getHeaders()
    },
    data : data,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  };

  axios(config)
    .catch(function (error) {
      logger.log("error", "Unable to upload video: " + error);
    })
    .finally(async () => {
      try {
        await unlink(videoPath);
      } catch (e) {
        logger.log("error", "Unable to delete video from local. " + e);
      }
    })
}

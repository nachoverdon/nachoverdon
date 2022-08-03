import { config } from "dotenv";

config();

import { join } from "path";
import { readdirSync, statSync, lstatSync } from "fs";
import { ConnectionStatus, SlpLiveStream, SlpRealTime } from "@vinceau/slp-realtime";
import { Ports, SlippiGame, characters as SlippiCharacters, stages as SlippiStages } from "@slippi/slippi-js";
import { Character, Stats } from "./stats";
import moment from "moment/moment";
import { execCommandWithResult, sleep } from "./util";
// import { updateReadme } from "./github"

const ADDRESS = "127.0.0.1";
const PORT = Ports.DEFAULT;
const SLIPPI_ACCOUNTS = process.env.SLIPPI_ACCOUNTS!.split(",");
const SLIPPI_REPLAYS = process.env.SLIPPI_REPLAYS!;

(async () => {
  while (true) {
    while (!await isSlippiRunning()) {
      console.log("Waiting for Slippi...");
      await sleep(5000);
    }

    await waitForReplayEnd();
    await processLatestReplay();
  }
})();

async function processLatestReplay() {
  let slpFiles: string[] = [];
  slpFiles = getAllSlpFiles(SLIPPI_REPLAYS, slpFiles);
  const mostRecentReplay = getMostRecentSlpFile(slpFiles);

  // TODO: Get latest replay. If different from last one, process replay
  console.log(`Most recent replay: ${mostRecentReplay}`);

  if (!mostRecentReplay) {
    return;
  }

  try {
    const stats = processReplay(mostRecentReplay);

    if (stats) {
      console.log("STATS!!!", stats);
      // updateReadme(stats!);
    }
  } catch (err) {
    console.error("Unable to get game stats", err);
  }
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

function getPlayerIndex(game: SlippiGame): number {
  const players = game.getMetadata()!.players;

  for (const index in players) {
    // @ts-ignore
    const player: any = players[index];

    if (SLIPPI_ACCOUNTS.includes(player.names.code))
      return parseInt(index);
  }

  console.log(`Cannot find any account that matches ${SLIPPI_ACCOUNTS.join(", ")}`);

  return -1;
}

/**
 * -1 = Draw or unresolved
 * 0 = Player 1
 * 1 = Player 2
 *
 * @param game
 */
function getWinnerIndex(game: SlippiGame): number {
  const gameEnd = game.getGameEnd();

  if (!gameEnd)
    return -1;

  const gameEndMethod = gameEnd!.gameEndMethod;

  switch (gameEndMethod) {
    case 1: {
      const latestFrame = game.getLatestFrame();

      if (!latestFrame)
        return 0;

      const p1Percent = latestFrame.players[0]!.post.percent!;
      const p2Percent = latestFrame.players[1]!.post.percent!;

      if (p1Percent === p2Percent)
        return -1;
      else if (p1Percent > p2Percent)
        return 1;

      return 0;
    }
    case 2: {
      const latestFrame = game.getLatestFrame();

      if (!latestFrame)
        return -1;

      const p1StocksRemaining = latestFrame.players[0]!.post.stocksRemaining!;
      const p2StocksRemaining = latestFrame.players[1]!.post.stocksRemaining!;

      if (p1StocksRemaining === p2StocksRemaining)
        return -1;
      if (p1StocksRemaining > p2StocksRemaining)
        return 0;

      return 1;
    }
    case 7:
      if (gameEnd.lrasInitiatorIndex == 0)
        return 1;

      return 0;
    case 0:
    default:
      return -1;
  }
}

function getStats(game: SlippiGame, playerIndex: number): Stats {
  const win = getWinnerIndex(game) === playerIndex;
  const character = getCharacter(game, playerIndex);
  const opIndex = playerIndex === 0 ? 1 : 0;
  const opCharacter = getCharacter(game, opIndex);
  // const opNametag = game.getMetadata()!.players![opIndex].names!.netplay ?? game.getMetadata()!.players![opIndex].names!.code!
  const stage = SlippiStages.getStageName(game.getSettings()!.stageId!);
  const stocksRemaining = game.getLatestFrame()!.players[playerIndex]!.post.stocksRemaining!;
  const stats = game.getStats()!;
  const overallStats = stats.overall[playerIndex];
  const openingsPerKill = overallStats.openingsPerKill.ratio ? overallStats.openingsPerKill.ratio : 0;
  const totalDamage = overallStats.totalDamage;
  const damagePerOpening = overallStats.damagePerOpening.ratio ? overallStats.damagePerOpening.ratio : 0;
  const inputsPerMinute = overallStats.inputsPerMinute.ratio ? overallStats.inputsPerMinute.ratio : 0;
  const duration = getDuration(stats.lastFrame);


  return {
    win: win,
    character: character,
    opponentCharacter: opCharacter,
    // opponentNameTag: opNametag,
    stage: stage,
    stocksRemaining: stocksRemaining,
    openingsPerKill: openingsPerKill,
    totalDamage: totalDamage,
    damagePerOpening: damagePerOpening,
    inputsPerMinute: inputsPerMinute,
    duration: duration,
  }
}

function getCharacter(game: SlippiGame, playerIndex: number): Character {
  const characterId = game.getSettings()!.players[playerIndex].characterId!;
  const name = SlippiCharacters.getCharacterName(characterId);

  return {
    name: name,
    id: characterId,
  }
}

function getDuration(frames: number): string {
  const duration = moment.duration(frames / 60, 'seconds');

  return moment.utc(duration.as('milliseconds')).format('m:ss');
}

function processReplay(replayPath: string): Stats | null {
  const game = new SlippiGame(replayPath);

  if (!game)
    throw new Error("Game is null.");

  const anyPlayerIsNotHuman = game.getSettings()!.players.find(player => {
    return player.type == 1 || player.type == 2 || player.type == 3;
  });

  if (anyPlayerIsNotHuman) {
    console.log("A player is not human.");

    return null;
  }

  const gameIsUnresolved = game.getGameEnd() && game.getGameEnd()?.gameEndMethod === 0;

  if (gameIsUnresolved) {
    console.log("Game is unresolved");

    return null;
  }

  // console.log(game.getSettings(), game.getMetadata(), game.getStats());
  // @ts-ignore
  const accountIndex = getPlayerIndex(game);

  if (accountIndex === -1) {
    console.log("Player not found. Get gud, kid.");

    return null;
  }

  // Ignore doubles games
  if (game.getSettings()!.players.length > 2) {
    console.log("Doubles are not supported.");

    return null;
  }

  return getStats(game, accountIndex);
}

async function waitForReplayEnd() {
  let shouldKeepWaiting = true;
  const stream = new SlpLiveStream("dolphin"); //  { outputFiles: false } when +3.2.0 gets released

  stream.start(ADDRESS, PORT)
    .then(() => {
      console.log("Connected to Slippi");
    })
    .catch((err) => {
      console.error("Unable to connect to Slippi", err);
    });
  stream.connection.on("statusChange", (status) => {
    if (status === ConnectionStatus.DISCONNECTED) {
      shouldKeepWaiting = false
    }
  });

  const realtime = new SlpRealTime();

  realtime.setStream(stream);
  realtime.game.end$.subscribe((_) => shouldKeepWaiting = false);

  while (shouldKeepWaiting) {
    await sleep(5000);
  }
}

async function isSlippiRunning(): Promise<boolean> {
    const result = await execCommandWithResult("tasklist");

    if (!result) {
      return false;
    }

    return result.includes("Slippi Dolphin.exe");
}

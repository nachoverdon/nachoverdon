import { config } from "dotenv";

config();

(() => {
  if (!process.env.UNIQUE_KEY || !process.env.PORT) {
    throw new Error("UNIQUE_KEY or PORT variable not defined.");
  }
})();

import { join, extname } from "path";
import { lstatSync, promises, unlink } from "fs";
import express from "express";
import multer from "multer";

const UNIQUE_KEY = process.env.UNIQUE_KEY!;
const PORT = process.env.PORT!;
const videosDir = join(__dirname, "videos");
const app = express();
let last_match_file = "";

async function findLastMatch(): Promise<string | ""> {
  const files = await promises.readdir(videosDir);
  const sortedFiles = files
    .filter(file => file.endsWith(".mp4"))
    .map((file) => ({ file, mtime: lstatSync(file).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());


  return sortedFiles.length ? sortedFiles[0].file : "";
}

// Delete all other videos in that same folder
async function deleteOtherVideos() {
  const target = last_match_file;
  const files = await promises.readdir(videosDir);

  files
    .map(file => join(videosDir, file))
    .filter(file => file !== target)
    .forEach(file => unlink(file, (err) => {
      if (err) console.error(`Unable to delete file ${file}`, err);
    }));
}

// Save video somewhere in the static folder with a generated unique name that includes the
// exact date
const videoStorage = multer.diskStorage({
  destination: videosDir,
  filename: (_, file, cb) => {
    cb(null, file.fieldname + "_" + Date.now() + extname(file.originalname))
  }
});

const videoUpload = multer({
  storage: videoStorage,
  fileFilter(_, file, cb) {
    // upload only mp4 and mov format
    if (!file.originalname.match(/\.(mp4|MPEG-4|mov)$/)) {
      return cb(new Error('Please upload a video'));
    }

    cb(null, true);
  }
})

app.get("/last_match.mp4", async (_, res) => {
  // Gets the most recent video either by getting the stored name or by checking the video files
  if (!last_match_file && !(last_match_file = await findLastMatch())) {
    return res.status(404);
  }

  // Serve the file
  // Might need to add parameter like mimetype to serve properly
  return res.sendFile(last_match_file);
});

app.post("/uploadLastMatch", videoUpload.single("video"), (req, res) => {
  // Require a credential key as a parameter
  if (req.body["UNIQUE_KEY"] !== UNIQUE_KEY) {
    return res.send({
      error: "Wrong UNIQUE_KEY",
    });
  }

  // Store the name globally or somewhere accessible
  if (req.file) {
    last_match_file = join(videosDir, req.file!.filename);
    deleteOtherVideos().catch(console.error);
  }

  return res.send({
    message: "Video uploaded :)",
    file: req.file,
  });
});

(async () => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();

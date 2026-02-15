require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
app.use(express.static("public"));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

app.post("/generate", upload.single("video"), async (req, res) => {
  try {
    const text = req.body.text;
    const videoPath = req.file.path;
    const audioPath = "outputs/voice.mp3";
    const outputVideo = "outputs/final.mp4";

    const tts = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}`,
      { text },
      {
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    fs.writeFileSync(audioPath, tts.data);

    ffmpeg(videoPath)
      .addInput(audioPath)
      .outputOptions("-map 0:v", "-map 1:a", "-shortest")
      .save(outputVideo)
      .on("end", () => res.download(outputVideo));

  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

app.listen(3000);

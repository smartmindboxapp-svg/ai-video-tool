require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const FormData = require("form-data");
const path = require("path");

const app = express();
app.use(express.static("public"));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

/* ========= AUDIO ========= */
app.post("/audio", async (req, res) => {
  try {
    const text = req.body.text;
    const audioPath = "outputs/voice.mp3";

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
    res.sendFile(path.join(__dirname, audioPath));

  } catch (e) {
    console.error(e);
    res.status(500).send("Audio error");
  }
});

/* ========= VIDEO + SUBTITLES PREVIEW ========= */
app.post("/preview", upload.single("video"), async (req, res) => {
  try {
    const text = req.body.text;
    const videoFile = req.file;

    const audioPath = "outputs/voice.mp3";
    const subtitlePath = "outputs/sub.srt";
    const previewVideo = "outputs/preview.mp4";

    // TTS
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

    // Whisper subtitles
    const form = new FormData();
    form.append("file", fs.createReadStream(audioPath));
    form.append("model", "whisper-1");
    form.append("response_format", "srt");

    const sub = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders()
        }
      }
    );

    fs.writeFileSync(subtitlePath, sub.data);

    // Merge for preview
    ffmpeg(videoFile.path)
      .addInput(audioPath)
      .outputOptions([
        "-map 0:v",
        "-map 1:a",
        "-vf subtitles=" + subtitlePath,
        "-shortest"
      ])
      .save(previewVideo)
      .on("end", () => {
        res.sendFile(path.join(__dirname, previewVideo));
      });

  } catch (e) {
    console.error(e);
    res.status(500).send("Preview error");
  }
});

/* ========= EXPORT ========= */
app.post("/generate", upload.single("video"), async (req, res) => {
  try {
    const text = req.body.text;
    const videoFile = req.file;

    const audioPath = "outputs/voice.mp3";
    const subtitlePath = "outputs/sub.srt";
    const finalVideo = "outputs/final.mp4";

    // TTS
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

    // Whisper
    const form = new FormData();
    form.append("file", fs.createReadStream(audioPath));
    form.append("model", "whisper-1");
    form.append("response_format", "srt");

    const sub = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders()
        }
      }
    );

    fs.writeFileSync(subtitlePath, sub.data);

    // Final export
    ffmpeg(videoFile.path)
      .addInput(audioPath)
      .outputOptions([
        "-map 0:v",
        "-map 1:a",
        "-vf subtitles=" + subtitlePath,
        "-shortest"
      ])
      .save(finalVideo)
      .on("end", () => res.download(finalVideo));

  } catch (e) {
    console.error(e);
    res.status(500).send("Export error");
  }
});

app.listen(3000);

require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const FormData = require("form-data");

const app = express();
app.use(express.static("public"));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

app.post("/generate", upload.fields([
  { name: "video" },
  { name: "image" }
]), async (req, res) => {
  try {
    const text = req.body.text;
    const videoFile = req.files.video?.[0];
    const imageFile = req.files.image?.[0];

    const audioPath = "outputs/voice.mp3";
    const subtitlePath = "outputs/sub.srt";
    const finalVideo = "outputs/final.mp4";

    // 1️⃣ TTS
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

    // 2️⃣ Whisper subtitles
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

    // 3️⃣ No video → return audio
    if (!videoFile) {
      return res.download(audioPath);
    }

    // 4️⃣ Build ffmpeg inputs
    let cmd = ffmpeg(videoFile.path).addInput(audioPath);

    if (imageFile) {
      cmd = cmd.addInput(imageFile.path)
        .complexFilter([
          "[0:v][2:v] overlay=W-w-20:H-h-20"
        ]);
    }

    // 5️⃣ Add audio + subtitles
    cmd
      .outputOptions([
        "-map 0:v",
        "-map 1:a",
        "-vf subtitles=" + subtitlePath,
        "-shortest"
      ])
      .save(finalVideo)
      .on("end", () => res.download(finalVideo));

  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

app.listen(3000);

import { getVideoMetadata, generatePreviewSprites } from "./src/service/ffmpeg.service.js";

const test = async () => {
  try {
    const metadata = await getVideoMetadata("./sample.mp4");
    console.log("Video Metadata:", metadata);
  } catch (error) {
    console.error("Error:", error.message);
  }
};


// const result = await generatePreviewSprites({
//   inputPath: "./sample.mp4",
//   outputDir: "./preview-output",
//   interval: 5,
//   columns: 5
// });

import { generateHLS } from "./src/service/ffmpeg.service.js";

const result = await generateHLS({
  inputPath: "./sample.mp4",
  outputDir: "./hls-output"
});

// console.log(result);

console.log(result);

// test();
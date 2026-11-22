import FFmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs/promises";

const getProbeData = (filePath) => {
    return new Promise((resolve, reject) => {
        FFmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata);
        });
    });
};

export const getVideoMetadata = async(filePath) => {
    if(!filePath) {
        throw new Error("Video File is required");
    }

    const metaData = await getProbeData(filePath);

    const videoStream = metaData.streams.find((stream) => stream.codec_type === "video");

    if(!videoStream) {
        throw new Error("No Video Stream found");
    }

    const audioStream = metaData.streams.find((stream) => stream.codec_type === "audio");

    return {
        duration: metaData.format.duration,
        size: metaData.format.size,
        format: metaData.format.format_name,
        width: videoStream.width,
        height: videoStream.height,
        codec: videoStream.codec_name,
        frameRate: videoStream.r_frame_rate,

        hasAudio: Boolean(audioStream)
    }
}

export const getSupportedResolutions = (height) => {
    const resolutions = [
        { name: "144p", height: 144 },
        { name: "240p", height: 240 },
        { name: "360p", height: 360 },
        { name: "480p", height: 480 },
        { name: "720p", height: 720 },
        { name: "1080p", height: 1080 },
        { name: "2160p", height: 2160 }
    ];

    return resolutions.filter(
        (resolution) => resolution.height <= height
    );
};

export const generateThumbnail = ({
  inputPath,
  outputPath,
  timestamp = 5
}) => {
  if (!inputPath || !outputPath) {
    throw new Error("Input and output paths are required");
  }

  return new Promise((resolve, reject) => {
    FFmpeg(inputPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions("-q:v 2")
      .output(outputPath)
      .on("end", () => {
        console.log("Thumbnail generated:", outputPath);
        resolve(outputPath);
      })
      .on("error", reject)
      .run();
  });
};

export const generatePreviewSprites = async({inputPath, outputDir, interval = 5, columns = 5}) => {
    if(!inputPath || !outputDir) {
        throw new Error("Input and Output paths are required");
    }

    if(interval <= 0 || columns <= 0) {
        throw new Error("Interval and Columns must be positive");
    }

    const metaData = await getVideoMetadata(inputPath);
    const duration = Number(metaData.duration);

    if(!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Invalid video duration");
    }

    await fs.mkdir(outputDir, {recursive: true});

    const frameCount = Math.ceil(duration / interval);
    const rows = Math.ceil(frameCount / columns);

    const spritePath = path.join(outputDir, "preview.jpg");
    const vttPath = path.join(outputDir, "preview.vtt");

   const filter = [
    `fps=1/${interval}`,
    "scale=720:405:force_original_aspect_ratio=decrease:force_divisible_by=2",
    "pad=720:405:(ow-iw)/2:(oh-ih)/2",
    `tile=${columns}x${rows}:padding=0:margin=0`
].join(",");

    await new Promise((resolve, reject) => {
    FFmpeg(inputPath)
        .outputOptions(["-vf", filter, "-frames:v 1"])
        .output(spritePath)
        .on("start", commandLine => {
            console.log("Preview FFmpeg command:", commandLine);
        })
        .on("stderr", line => {
            console.log("Preview FFmpeg:", line);
        })
        .on("end", resolve)
        .on("error", reject)
        .run();
});

    let vtt = "WEBVTT\n\n";

    for (let i = 0; i < frameCount; i++) {
        const start = i * interval;
        const end = Math.min((i + 1) * interval, duration);

        const x = (i % columns) * 720;
        const y = Math.floor(i / columns) * 405;

        vtt += `${formatVttTime(start)} --> ${formatVttTime(end)}\n`;
        vtt += `preview.jpg#xywh=${x},${y},720,405\n\n`;
    }
    await fs.writeFile(vttPath, vtt);
    return {
        spritePath,
        vttPath,
        frameCount,
        interval
    }
}

const formatVttTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
};

const resolutionBitrates = {
  144: "150k",
  240: "300k",
  360: "600k",
  480: "1000k",
  720: "2500k",
  1080: "5000k",
  2160: "15000k"
};

export const generateHLS = async({inputPath, outputDir}) => {
    if(!inputPath || !outputDir) {
        throw new Error("Input and output paths are required");
    }

    const metaData = await getVideoMetadata(inputPath);
    const resolutions = getSupportedResolutions(metaData.height);

    if(!resolutions.length) {
        throw new Error("No Supported resolutions found");
    }

    await fs.mkdir(outputDir, {recursive: true});

    const masterPlaylist = ["#EXTM3U", "#EXT-X-VERSION:3"];

    for(const resolution of resolutions) {
        const {name, height} = resolution;

        const bitrate = resolutionBitrates[height];
        const resolutionDir = path.join(outputDir, name);
        await fs.mkdir(resolutionDir, {recursive: true});
        const playlistPath = path.join(resolutionDir, "index.m3u8");
        const segmentPath = path.join(resolutionDir, "segment_%03d.ts");

         const width = Math.floor(
      (metaData.width * height) / metaData.height / 2
    ) * 2;

    await new Promise((resolve, reject) => {
        let command = FFmpeg(inputPath)
        .videoCodec("libx264")
        .outputOptions([
             `-vf scale=-2:${height}`,
          `-b:v ${bitrate}`,
          "-preset veryfast",
          "-pix_fmt yuv420p",
          "-hls_time 6",
          "-hls_playlist_type vod",
          "-hls_flags independent_segments",
          `-hls_segment_filename ${segmentPath}`
        ]);

        if(metaData.hasAudio) {
            command = command.audioCodec("aac").outputOptions(["-b:a 128k"]);
        } else {
            command = command.noAudio();
        }

        command.output(playlistPath)
        .on("end", resolve)
        .on('error', reject)
        .run();
    });

    const bandWidth = parseInt(bitrate) * 1000 + (metaData.hasAudio ? 128000 : 0);
    masterPlaylist.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandWidth},RESOLUTION=${width}x${height}`,
      `${name}/index.m3u8`
    )
    console.log(`${name} generated successfully`);
    }

    const masterPath = path.join(outputDir, "master.m3u8");

    await fs.writeFile(masterPath, 	masterPlaylist.join("\n") + "\n");

    return {
        masterPath,
        resolutions: resolutions.map(({name}) => name),
        outputDir
    }
}
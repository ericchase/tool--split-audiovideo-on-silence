const filepath = Deno.args[0];
const duration = Deno.args[1];
const noise = Deno.args[2];

if (filepath) {
    console.log("Analyzing...");
    const silencePositions = await getSilencePositions(filepath, duration, noise);
    if (silencePositions) {
        const clipRanges = chunk(["0.0", ...silencePositions], 2);
        console.log("Detected", clipRanges.length, "Tracks");
        printClipRanges(clipRanges);
        console.log();
        await ffmpegSplitVideo(filepath, clipRanges);
    }
}

async function getSilencePositions(filepath, duration, noise) {
    const { status, stderr } = await ffmpegDetectSilences(filepath, duration, noise);
    if (status.success) {
        return extractSilencePositions(stderr);
    }
}

/**
 * @param {string} inputPath
 * @param {string[]} timestampRanges
 * @return {Promise<ProcessResult>}
 */
async function ffmpegSplitVideo(inputPath, timestampRanges) {
    const pad = Math.max(2, timestampRanges.length.toString().length);
    let count = 1;

    const extensionIndex = inputPath.lastIndexOf('.');
    const path = inputPath.substring(0, extensionIndex);
    const extension = inputPath.substring(extensionIndex);

    for (const [a, b] of timestampRanges) {
        const outputPath = `${path}_${count.toString().padStart(pad, '0')}${extension}`;

        console.log(`Track ${count.toString().padStart(pad, '0')}`);
        console.log(outputPath, "|", `from ${secondsToHMS(Number.parseInt(a))} to ${b ? secondsToHMS(Number.parseInt(b)) : 'end'}`);

        const p = Deno.run({
            cmd: [
                "ffmpeg",
                "-ss", `${a}s`,
                ...(b ? ["-to", `${b}s`] : []),
                "-i", inputPath,
                outputPath
            ],
            stderr: "piped",
            stdout: "piped",
        });

        const status = await p.status();
        console.log("write:", status.code === 0 ? 'good' : 'bad');
        if (status.success === true) {
            if (await ffprobeCheck(outputPath) === true) {
                ++count;
            }
        }
        console.log();
    }
}

/**
 * @param {string} inputPath
 */
async function ffprobeCheck(inputPath) {
    const p = Deno.run({
        cmd: ["ffprobe", inputPath],
        stderr: "piped",
        stdout: "piped",
    });

    const status = await p.status();
    console.log("check:", status.code === 0 ? 'good' : 'bad');
    if (status.success === false) {
        await Deno.remove(inputPath);
        return false;
    }
    return true;
}

/**
 * @typedef {object} Status
 * @property {boolean} success
 * @property {number} code
 * @property {number} [signal]
 */

/**
 * @typedef {object} ProcessResult
 * @property {Status} status
 * @property {Uint8Array} stdout
 * @property {Uint8Array} stderr
 */

/**
 * @param {string} inputPath
 * @param {string} duration
 * @param {string} noise
 * @return {Promise<ProcessResult>}
 */
async function ffmpegDetectSilences(inputPath, duration = "0.5", noise = "0.01") {
    const p = Deno.run({
        cmd: [
            "ffmpeg",
            "-i", inputPath,
            "-af", `silencedetect=duration=${duration}:noise=${noise}`,
            "-f", "null", "-",
        ],
        stderr: "piped",
        stdout: "piped",
    });
    const [status, stdout, stderr] = await Promise.all([
        p.status(),
        p.output(),
        p.stderrOutput(),
    ]);
    return { status, stdout, stderr };
}

/**
 * @param {Uint8Array} bytes
 * @return {string[]}
 */
function extractSilencePositions(bytes) {
    const lines = new TextDecoder()
        .decode(bytes)
        .split(/\r?\n/)
        .filter((line) => line.includes("silencedetect"));

    const positions = [];
    for (const line of lines) {
        {
            const seconds = line.split('silence_start:')[1];
            if (seconds) {
                positions.push(seconds.trim());
                continue;
            }
        }
        {
            const seconds = line.split('silence_end:')[1]?.split('|')[0];
            if (seconds) {
                positions.push(seconds.trim());
                continue;
            }
        }
    }

    return positions;
}

/**
 * @param {Array} array Array to chunk
 * @param {number} size Size of every chunk
 * @return {Array}
 */
function chunk(array, size) {
    const count = Math.ceil(array.length / size);

    const chunks = [];
    for (let i = 0; i < count; ++i) {
        chunks.push(array.slice(i * size, i * size + size));
    }
    return chunks;
}

function secondsToHMS(seconds) {
    let s = seconds;
    let m = 0;
    let h = 0;
    while (s >= 60) { ++m; s -= 60; }
    while (m >= 60) { ++h; m -= 60; }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function printClipRanges(timestampRanges) {
    const pad = Math.max(2, timestampRanges.length.toString().length);
    let count = 1;
    for (const [a, b] of timestampRanges) {
        console.log(`${count.toString().padStart(pad, '0')}: from ${secondsToHMS(Number.parseInt(a))} to ${b ? secondsToHMS(Number.parseInt(b)) : 'end'}`);
        ++count;
    }
}
# tool--split-audiovideo-on-silence
Split audio or video file based on detected silence.

Requires FFMPEG to run.

Utilizes the `silencedetect` filter: 
https://ffmpeg.org/ffmpeg-all.html#silencedetect

`program.exe <filepath> [duration] [noise]`

filepath

    Filepath must point to a valid audio or video file.

duration (in seconds)

    Set silence duration until notification.
    ie: 0.5

noise (as a decimal)

    Set noise tolerance.
    ie: 0.01
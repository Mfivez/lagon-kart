#!/usr/bin/env python3
"""Inspect and copy the user-provided MP3s; no transcoding or optional dependency."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [('Lap 1.mp3', 'lap-1-v1.mp3'), ('Lap 2.mp3', 'lap-2-v1.mp3')]


def synchsafe(data):
    value = 0
    for byte in data:
        value = (value << 7) | (byte & 127)
    return value


def inspect_mp3(data):
    tags = {}
    offset = 0
    version = None
    if data[:3] == b'ID3':
        version = '2.%d.%d' % (data[3], data[4])
        tag_end = 10 + synchsafe(data[6:10])
        cursor = 10
        while cursor + 10 <= tag_end and data[cursor] != 0:
            name = data[cursor:cursor + 4].decode('ascii', 'replace')
            size = synchsafe(data[cursor + 4:cursor + 8]) if data[3] == 4 else int.from_bytes(data[cursor + 4:cursor + 8], 'big')
            value = data[cursor + 10:cursor + 10 + size]
            if name.startswith('T') and value:
                encoding = {0: 'latin1', 1: 'utf-16', 2: 'utf-16-be', 3: 'utf-8'}.get(value[0], 'utf-8')
                tags[name] = value[1:].decode(encoding, 'replace').strip('\0')
            elif name.startswith('W'):
                tags[name] = value.decode('latin1', 'replace').strip('\0')
            else:
                tags[name] = {'bytes': len(value)}
            cursor += 10 + size
        offset = tag_end
    frames = 0
    total_samples = 0
    bitrates = set()
    sample_rates = set()
    channel_modes = set()
    skipped = 0
    while offset + 4 <= len(data):
        header = int.from_bytes(data[offset:offset + 4], 'big')
        version_bits = (header >> 19) & 3
        layer_bits = (header >> 17) & 3
        bitrate_index = (header >> 12) & 15
        rate_index = (header >> 10) & 3
        if header & 0xffe00000 != 0xffe00000 or version_bits != 3 or layer_bits != 1 or bitrate_index in (0, 15) or rate_index == 3:
            offset += 1
            skipped += 1
            continue
        bitrate = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrate_index]
        rate = [44100, 48000, 32000][rate_index]
        frame_size = 144000 * bitrate // rate + ((header >> 9) & 1)
        if offset + frame_size > len(data):
            break
        frames += 1
        total_samples += 1152
        bitrates.add(bitrate)
        sample_rates.add(rate)
        channel_modes.add(['stereo', 'joint-stereo', 'dual-channel', 'mono'][(header >> 6) & 3])
        offset += frame_size
    if not frames or len(sample_rates) != 1:
        raise ValueError('Expected a valid MPEG1 Layer III stream with a single sample rate')
    rate = next(iter(sample_rates))
    duration = total_samples / rate
    return {'format': 'MPEG-1 Layer III (MP3)', 'id3Version': version, 'id3TextFrames': tags,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'sampleRate': rate,
            'channelModes': sorted(channel_modes), 'frameCount': frames,
            'encodedDurationSeconds': round(duration, 3),
            'bitrateKbps': sorted(bitrates), 'averageFileBitrateKbps': round(len(data) * 8 / duration / 1000, 3),
            'skippedNonFrameBytesAfterId3': skipped,
            'durationNote': 'Frame duration includes encoder delay/padding; decoded browser duration may differ slightly.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the copies and inspection without writing')
    args = parser.parse_args()
    source = ROOT / 'assets' / 'audios'
    destination = ROOT / 'client' / 'public' / 'audio'
    report = {'origin': 'Two MP3 files supplied by the user in assets/audios; preserved byte-for-byte.',
              'license': 'No license inferred or assigned; inspect metadata below. User requested their integration.',
              'conversion': 'None: unchanged copies, same-origin playback, versioned filenames.', 'files': []}
    for original, output in FILES:
        data = (source / original).read_bytes()
        metadata = inspect_mp3(data)
        metadata.update({'source': 'assets/audios/' + original, 'output': 'client/public/audio/' + output})
        report['files'].append(metadata)
        target = destination / output
        if args.check:
            if not target.exists() or target.read_bytes() != data:
                raise SystemExit('Missing or modified copy: ' + str(target))
        else:
            destination.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        print(json.dumps(metadata, ensure_ascii=False))
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    report_path = source / 'inspection.json'
    if args.check:
        if not report_path.exists() or report_path.read_text() != encoded:
            raise SystemExit('Inspection report differs; run scripts/prepare-music.py')
        print('Music source hashes, versioned copies and inspection: OK')
    else:
        report_path.write_text(encoded)


if __name__ == '__main__':
    main()

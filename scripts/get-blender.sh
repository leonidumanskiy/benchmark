#!/bin/sh
# Install Blender 4.2 LTS locally (Linux x64) into .tools/blender for scripts/build-assets.mjs.
set -e
cd "$(dirname "$0")/.."
V=4.2.3
mkdir -p .tools && cd .tools
curl -fL "https://download.blender.org/release/Blender4.2/blender-$V-linux-x64.tar.xz" -o blender.tar.xz
tar xf blender.tar.xz && rm blender.tar.xz && rm -rf blender && mv "blender-$V-linux-x64" blender
./blender/blender -b --version | head -1

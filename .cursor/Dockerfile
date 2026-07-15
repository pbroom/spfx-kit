# SPFx Kit cloud agent base image.
# Cursor checks out the repo separately; do not COPY the project here.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gnupg \
    python3 \
    build-essential \
    xz-utils \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Pin Node to the SPFx Kit engine (.nvmrc / .node-version): 22.22.3
ENV NODE_VERSION=22.22.3
# Verify the tarball against the published SHA256 checksums before extracting.
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt \
    && cd /tmp && grep " node-v${NODE_VERSION}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
    && tar -xJ -C /usr/local --strip-components=1 -f /tmp/node.tar.xz \
    && rm /tmp/node.tar.xz /tmp/SHASUMS256.txt \
    && node --version \
    && npm --version

# Keep npm on the packageManager range used by this monorepo.
RUN npm install -g npm@10.9.8 \
    && npm --version

# Non-root user expected by Cursor cloud agents.
RUN id -u ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu \
    && mkdir -p /home/ubuntu \
    && chown -R ubuntu:ubuntu /home/ubuntu

USER ubuntu
WORKDIR /home/ubuntu

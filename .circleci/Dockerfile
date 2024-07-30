# Use the CircleCI base image
FROM cimg/base:edge-22.04

USER root

# Install system dependencies or any other tools you need
RUN apt-get update && sudo apt-get install -y \
    libgtk-3-dev webkit2gtk-4.0 libappindicator3-dev librsvg2-dev patchelf protobuf-compiler cmake

# Install Go
ENV GO_VERSION 1.22.0
RUN wget https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz -O go.tar.gz \
    && tar -C /usr/local -xzf go.tar.gz \
    && rm go.tar.gz

# Set Go environment variables
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

# Install Node
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs


USER circleci

# Add /usr/local/bin to the PATH for the circleci user
RUN echo 'export PATH="/usr/local/bin:$PATH"' >> $HOME/.bashrc

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
RUN echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> /home/circleci/.bashrc
RUN ~/.cargo/bin/rustup install 1.78
RUN ~/.cargo/bin/rustup default 1.78
RUN ~/.cargo/bin/rustup target add wasm32-unknown-unknown

# Install Deno
RUN curl -fsSL https://deno.land/install.sh | sh
RUN echo 'export DENO_INSTALL="/home/circleci/.deno"' >> /home/circleci/.bashrc
RUN echo 'export PATH="/home/circleci/.deno/bin:$PATH"' >> /home/circleci/.bashrc

# Configure npm to use a directory in the circleci user's home for global packages
RUN mkdir ~/.npm-global \
    && npm config set prefix '~/.npm-global' \
    && echo 'export PATH="~/.npm-global/bin:$PATH"' >> /home/circleci/.bashrc

# Install pnpm
RUN npm install -g pnpm

# Add other setup commands you require

USER root
# Clean up to reduce image size
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Switch back to the circleci user for any non-root actions
USER circleci

# Set the PATH environment variable
ENV PATH="/home/circleci/.cargo/bin:/home/circleci/.deno/bin:/home/circleci/.npm-global/bin:$PATH"

# We need killall for the CLI tests
USER root
RUN apt-get update && apt-get install psmisc
USER circleci

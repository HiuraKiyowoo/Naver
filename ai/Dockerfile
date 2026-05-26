FROM python:3.11-slim

WORKDIR /app

# Install system dependencies + VNC stack
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        git \
        ca-certificates \
        xvfb \
        x11vnc \
        websockify \
        novnc \
        chromium \
        openbox \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set display untuk Xvfb
ENV DISPLAY=:99

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY app.py .
COPY src/ ./src/
COPY templates/ ./templates/

# HF Spaces non-root user (uid 1000)
RUN useradd -m -u 1000 user && chown -R user:user /app

ENV PATH="/home/user/.local/bin:$PATH"

USER user

ENV CLAW_WORKSPACE=/tmp/workspace
ENV PORT=7860

EXPOSE 7860

# Start Xvfb → openbox (window manager) → x11vnc → websockify/noVNC → app
CMD mkdir -p /tmp/.X11-unix && \
    Xvfb :99 -screen 0 1280x720x24 & sleep 1 && \
    openbox --display :99 & sleep 1 && \
    x11vnc -display :99 -nopw -listen localhost -xkb -forever -rfbport 5900 -quiet & sleep 1 && \
    websockify --web /usr/share/novnc 6080 localhost:5900 & sleep 1 && \
    python app.py




FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates libtbb12 unzip \
    && rm -rf /var/lib/apt/lists/*

# PotreeConverter 2.1.2
RUN curl -fSL -o /tmp/pc.zip \
      "https://github.com/potree/PotreeConverter/releases/download/2.1.2/PotreeConverter_2.1.2_x64_linux.zip" && \
    unzip /tmp/pc.zip -d /tmp/pc && \
    mv /tmp/pc/PotreeConverter_* /opt/PotreeConverter && \
    rm -rf /tmp/pc.zip /tmp/pc && \
    chmod +x /opt/PotreeConverter/PotreeConverter

# Potree 1.8.2 viewer library
RUN curl -fSL -o /tmp/potree.zip \
      "https://github.com/potree/potree/releases/download/1.8.2/Potree_1.8.2.zip" && \
    unzip -q /tmp/potree.zip -d /tmp/potree && \
    mkdir -p /app/frontend/potree && \
    cp -r /tmp/potree/Potree_1.8.2/libs /app/frontend/potree/libs && \
    cp -r /tmp/potree/Potree_1.8.2/build/potree/resources /app/frontend/potree/resources && \
    cp -r /tmp/potree/Potree_1.8.2/build/potree/lazylibs /app/frontend/potree/lazylibs && \
    cp /tmp/potree/Potree_1.8.2/build/potree/potree.js /app/frontend/potree/ && \
    cp /tmp/potree/Potree_1.8.2/build/potree/potree.css /app/frontend/potree/ && \
    rm -rf /tmp/potree.zip /tmp/potree

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY frontend/ frontend/

RUN mkdir -p /app/data/uploads /app/data/processed /app/data/thumbnails
VOLUME /app/data

ENV DATA_DIR=/app/data
ENV POTREE_CONVERTER_PATH=/opt/PotreeConverter/PotreeConverter

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:8000/auth/me || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates libtbb12 \
    && rm -rf /var/lib/apt/lists/*

# PotreeConverter 2.1
RUN mkdir -p /opt/PotreeConverter && \
    curl -fSL -o /tmp/pc.tar.gz \
      "https://github.com/potree/PotreeConverter/releases/download/2.1.1/PotreeConverter_2.1.1_x64_linux.tar.gz" && \
    tar xzf /tmp/pc.tar.gz -C /opt/PotreeConverter --strip-components=1 && \
    rm /tmp/pc.tar.gz && \
    chmod +x /opt/PotreeConverter/PotreeConverter

# Potree viewer library (built files are committed in the repo)
RUN git clone --depth 1 https://github.com/potree/potree.git /tmp/potree && \
    mkdir -p /app/frontend/potree && \
    cp -r /tmp/potree/build/potree/* /app/frontend/potree/ && \
    cp -r /tmp/potree/libs /app/frontend/potree/libs && \
    cp -r /tmp/potree/resources /app/frontend/potree/resources && \
    rm -rf /tmp/potree

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

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    lsb-release \
    wget \
    gnupg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings && \
    wget -O- https://rspamd.com/apt-stable/gpg.key | gpg --dearmor -o /etc/apt/keyrings/rspamd.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/rspamd.gpg] http://rspamd.com/apt-stable/ $(lsb_release -cs) main" > /etc/apt/sources.list.d/rspamd.list && \
    apt-get update && \
    apt-get install -y rspamd && \
    rm -rf /var/lib/apt/lists/*

COPY local.d/ /etc/rspamd/local.d/
COPY override.d/ /etc/rspamd/override.d/

RUN mkdir -p /etc/rspamd/dkim && \
    chown -R _rspamd:_rspamd /etc/rspamd/dkim

EXPOSE 11332 11333 11334

CMD ["rspamd", "-f", "-u", "_rspamd", "-g", "_rspamd"]

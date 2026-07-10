FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    postfix \
    postfix-pgsql \
    libsasl2-modules \
    sasl2-bin \
    ca-certificates \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Self-signed TLS sertifikası oluştur
RUN mkdir -p /etc/ssl/certs /etc/ssl/private && \
    openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
      -subj "/CN=mail.sentroy.com" \
      -keyout /etc/ssl/private/ssl-cert-snakeoil.key \
      -out /etc/ssl/certs/ssl-cert-snakeoil.pem && \
    chmod 600 /etc/ssl/private/ssl-cert-snakeoil.key

COPY main.cf /etc/postfix/main.cf
COPY master.cf /etc/postfix/master.cf

RUN mkdir -p /var/mail/vhosts && \
    groupadd -g 5000 vmail && \
    useradd -g vmail -u 5000 vmail -d /var/mail && \
    chown -R vmail:vmail /var/mail && \
    mkdir -p /etc/postfix/virtual

COPY virtual/ /etc/postfix/virtual/

RUN postmap /etc/postfix/virtual/domains 2>/dev/null || true && \
    postmap /etc/postfix/virtual/mailboxes 2>/dev/null || true

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 25 587 465

CMD ["/entrypoint.sh"]

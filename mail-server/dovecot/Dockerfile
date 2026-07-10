FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    dovecot-core \
    dovecot-imapd \
    dovecot-lmtpd \
    dovecot-auth-lua \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Self-signed TLS sertifikası oluştur
RUN mkdir -p /etc/ssl/certs /etc/ssl/private && \
    openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
      -subj "/CN=mail.sentroy.com" \
      -keyout /etc/ssl/private/ssl-cert-snakeoil.key \
      -out /etc/ssl/certs/ssl-cert-snakeoil.pem && \
    chmod 600 /etc/ssl/private/ssl-cert-snakeoil.key

RUN groupadd -g 5000 vmail && \
    useradd -g vmail -u 5000 vmail -d /var/mail && \
    mkdir -p /var/mail/vhosts && \
    chown -R vmail:vmail /var/mail

COPY dovecot.conf /etc/dovecot/dovecot.conf

EXPOSE 143 993 24 12345

CMD ["dovecot", "-F"]

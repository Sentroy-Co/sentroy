# Proxy worker — milter proxy
bind_socket = "*:11333";
milter = yes;
timeout = 120s;
upstream "local" {
  default = yes;
  self_scan = yes;
}

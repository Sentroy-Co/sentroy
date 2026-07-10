export interface DomainConnectSettings {
  providerName: string
  urlSyncUX: string
  urlAsyncUX?: string
  urlAPI?: string
  width?: number
  height?: number
}

export interface DomainConnectDiscoveryResult {
  supported: boolean
  providerName?: string
  applyUrl?: string
  settings?: DomainConnectSettings
}

export interface TemplateVars {
  serverIp: string
  dkimSelector: string
  dkimPublicKey: string
  dmarcEmail: string
}

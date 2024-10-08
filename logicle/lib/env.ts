const env = {
  databaseUrl: `${process.env.DATABASE_URL}`,
  appUrl: `${process.env.APP_URL}`,

  get isHttps() {
    // Using a getter to dynamically check the protocol every time `isHttps` is accessed.
    const protocolMatch = this.appUrl.match(/^(https?):\/\//)
    return protocolMatch ? protocolMatch[1] === 'https' : false
  },

  product: 'logicle',
  redirectAfterSignIn: '/chat',

  oidc: {
    path: '/api/oauth/oidc',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}` + '/api/oauth/oidc',
  },

  // SAML Jackson configuration
  saml: {
    issuer: `${process.env.APP_URL}`,
    path: '/api/oauth/saml',
    callback: `${process.env.APP_URL}`,
    redirectUrl: `${process.env.APP_URL}` + '/api/oauth/saml',
  },

  // SMTP configuration for NextAuth
  smtp: {
    host: '',
    port: Number(''),
    user: '',
    password: '',
    from: '',
  },
  /*smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  },*/

  // NextAuth configuration
  nextAuth: {
    secret: process.env.NEXTAUTH_SECRET,
    // We use very long session tokens, and periodically verify the user is still authorized
    // IdP expiration is not used at all
    sessionTokenDuration: 90 * 24 * 60 * 60,
  },

  groupPrefix: 'logicle-',
  sso: {
    locked: process.env.SSO_CONFIG_LOCK == '1',
  },
  backends: {
    locked: process.env.LLM_PROVIDER_CONFIG_LOCK == '1',
  },
  workspaces: {
    enable: process.env.ENABLE_WORKSPACES == '1',
  },
  tools: {
    enable: process.env.ENABLE_TOOLS == '1',
    openApi: {
      requireConfirmation: process.env.OPENAPI_TOOL_REQUIRE_CONFIRM == '1',
    },
  },
  signup: {
    enable: process.env.ENABLE_SIGNUP == '1',
  },
  chat: {
    enableAutoSummary: process.env.ENABLE_CHAT_AUTOSUMMARY == '1',
    autoSummaryMaxLength: 500,
    attachments: {
      enable: process.env.ENABLE_CHAT_ATTACHMENTS == '1',
      allowedFormats: process.env.CHAT_ATTACHMENTS_ALLOWED_FORMATS ?? '',
    },
  },
}

export default env

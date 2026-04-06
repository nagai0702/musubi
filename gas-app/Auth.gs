/**
 * Slack OAuth (Sign in with Slack)
 * 事前にスクリプトプロパティに SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_TEAM_ID を設定
 */

function getSlackService() {
  const props = PropertiesService.getScriptProperties();
  return OAuth2.createService('slack')
    .setAuthorizationBaseUrl('https://slack.com/openid/connect/authorize')
    .setTokenUrl('https://slack.com/api/openid.connect.token')
    .setClientId(props.getProperty('SLACK_CLIENT_ID'))
    .setClientSecret(props.getProperty('SLACK_CLIENT_SECRET'))
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('openid profile email')
    .setParam('team', props.getProperty('SLACK_TEAM_ID') || '');
}

function getSlackAuthUrl() {
  return getSlackService().getAuthorizationUrl();
}

function authCallback(request) {
  const service = getSlackService();
  const ok = service.handleCallback(request);
  if (ok) {
    return HtmlService.createHtmlOutput(
      '<p>ログイン成功。<a href="' + ScriptApp.getService().getUrl() + '">アプリを開く</a></p>'
    );
  }
  return HtmlService.createHtmlOutput('<p>ログイン失敗</p>');
}

function handleSlackCallback(e) {
  return authCallback(e);
}

function getCurrentUser() {
  const service = getSlackService();
  if (!service.hasAccess()) return null;
  const token = service.getAccessToken();
  const res = UrlFetchApp.fetch('https://slack.com/api/openid.connect.userInfo', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  if (!data.ok && !data.sub) return null;
  return {
    id: data.sub || data['https://slack.com/user_id'],
    name: data.name || data.given_name || 'unknown',
    email: data.email || ''
  };
}

function logout() {
  getSlackService().reset();
}

export const localSessionChannel = 'mpkpb-local-session'

export function reloadLocalSession() {
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(localSessionChannel)
    channel.postMessage('reload')
    channel.close()
  }
  window.location.reload()
}

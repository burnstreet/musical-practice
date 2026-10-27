/** iOS Safari in a browser tab (not added to the home screen). iPadOS reports a Mac UA, hence the touch check. */
export function isIosSafariTab(ua: string, standalone: boolean, touchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
  return ios && !standalone && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

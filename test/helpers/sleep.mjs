export function sleep(seconds) {
  const timeoutMilliseconds = seconds * 1000;

  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMilliseconds);
  });
}

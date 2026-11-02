// A build can print hundreds of lines a second: they go to the API in small batches, not one message each.
export function batched(send: (lines: string[]) => void, everyMs = 400, most = 200) {
  let lines: string[] = [];
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    while (lines.length) send(lines.splice(0, most));
  };
  return {
    add(more: string[]) {
      lines.push(...more);
      if (lines.length >= most) flush();
      else timer ??= setTimeout(flush, everyMs);
    },
    flush,
  };
}

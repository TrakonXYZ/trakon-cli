type solc = {
  compile(content: string): string
}

declare module 'solc' {
  function compile(content: string): string
  function loadRemoteVersion(
    version: string,
    callback: (err: any, compiler: solc) => void,
  ): Promise<solc>
}

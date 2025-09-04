export function createServer() {
  console.log('API REST server created');
  return {
    start: () => console.log('Server started'),
    stop: () => console.log('Server stopped'),
  };
}

export default createServer;

import { Server } from "./server";

const server = new Server();

server.listen((protocol, port) => {
  console.log(`Server is listening on ${protocol}://localhost:${port}`);
});

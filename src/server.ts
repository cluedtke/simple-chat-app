import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import { createServer as createHttpServer, Server as HTTPServer } from "http";
import {
  createServer as createHttpsServer,
  Server as HTTPSServer,
} from "https";
import fs from "fs";
import path from "path";

export class Server {
  private httpServer: HTTPServer;
  private httpsServer: HTTPSServer;
  private app: Application;
  private io: SocketIOServer;

  private activeSockets: string[] = [];

  private readonly HTTP_PORT = 8080;
  private readonly HTTPS_PORT = 8443;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const creds = this.createSslCreds();

    this.app = express();
    this.httpServer = createHttpServer(this.app);
    this.httpsServer = createHttpsServer(creds, this.app);
    this.io = socketIO(this.httpsServer);

    this.configureApp();
    this.configureRoutes();
    this.handleSocketConnection();
  }

  private createSslCreds(): { key: string; cert: string } {
    return {
      key: fs.readFileSync(
        path.join(__dirname, "../sslcert/selfsigned.key"),
        "utf8"
      ),
      cert: fs.readFileSync(
        path.join(__dirname, "../sslcert/selfsigned.crt"),
        "utf8"
      ),
    };
  }

  private configureApp(): void {
    this.app.use(express.static(path.join(__dirname, "../public")));
  }

  private configureRoutes(): void {
    this.app.get("/", (req, res) => {
      res.sendFile("index.html");
    });
  }

  private handleSocketConnection(): void {
    this.io.on("connection", (socket) => {
      const existingSocket = this.activeSockets.find(
        (existingSocket) => existingSocket === socket.id
      );

      if (!existingSocket) {
        console.info("NEW_SOCKET_CONNECTION", socket.id);

        this.activeSockets.push(socket.id);

        const updateUserList = {
          me: socket.id,
          users: this.activeSockets.filter(
            (existingSocket) => existingSocket !== socket.id
          ),
        };
        console.info("EMIT_UPDATE_USER_LIST", updateUserList);
        socket.emit("update-user-list", updateUserList);

        console.info("BROADCAST_UPDATE_USER_LIST", { users: [socket.id] });
        socket.broadcast.emit("update-user-list", { users: [socket.id] });
      }

      socket.on("call-user", (data) => {
        console.info("CAPTURED_CALL_USER");
        const callMade = {
          from: socket.id,
          to: data.to,
          offer: data.offer,
          socket: socket.id,
        };
        console.info("EMIT_CALL_MADE", callMade);
        socket.to(data.to).emit("call-made", callMade);
      });

      socket.on("make-answer", (data) => {
        console.info("CAPTURED_MAKE_ANSWER");
        const answerMade = {
          from: socket.id,
          to: data.to,
          socket: socket.id,
          answer: data.answer,
        };
        console.info("EMIT_ANSWER_MADE", answerMade);
        socket.to(data.to).emit("answer-made", answerMade);
      });

      socket.on("reject-call", (data) => {
        console.info("CAPTURED_REJECT_CALL");
        const callRejected = {
          from: socket.id,
          to: data.from,
          socket: socket.id,
        };
        console.info("EMIT_CALL_REJECTED", callRejected);
        socket.to(data.from).emit("call-rejected", callRejected);
      });

      socket.on("disconnect", () => {
        console.info("CAPTURED_DISCONNECT");
        this.activeSockets = this.activeSockets.filter(
          (existingSocket) => existingSocket !== socket.id
        );
        console.info("BROADCAST_REMOVE_USER", { socketId: socket.id });
        socket.broadcast.emit("remove-user", { socketId: socket.id });
      });
    });
  }

  public listen(callback: (port: number) => void): void {
    this.httpServer.listen(this.HTTP_PORT, () => {
      callback(this.HTTP_PORT);
    });
    this.httpsServer.listen(this.HTTPS_PORT, () => {
      callback(this.HTTPS_PORT);
    });
  }
}

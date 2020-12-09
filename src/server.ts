import express, { Application } from "express";
import socketIO, { Server as SocketIOServer, Socket } from "socket.io";
import { createServer as createHttpServer, Server as HTTPServer } from "http";
import {
  createServer as createHttpsServer,
  Server as HTTPSServer,
} from "https";
import fs from "fs";
import path from "path";

export class Server {
  private app: Application;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private httpsServer: HTTPSServer;
  private ioSSL: SocketIOServer;

  private activeSockets: string[] = [];

  private readonly HTTP_PORT = 8080;
  private readonly HTTPS_PORT = 8443;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    this.app = express();

    this.httpServer = createHttpServer(this.app);
    this.io = socketIO(this.httpServer);
    this.io.on("connection", this.handleSocketConnection);

    const creds = this.createSslCreds();
    this.httpsServer = createHttpsServer(creds, this.app);
    this.ioSSL = socketIO(this.httpsServer);
    this.ioSSL.on("connection", this.handleSocketConnection);

    this.configureApp();
    this.configureRoutes();
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

  private handleSocketConnection = (socket: Socket) => {
    const existingSocket = this.activeSockets.find(
      (existingSocket) => existingSocket === socket.id
    );

    if (!existingSocket) {
      this.activeSockets.push(socket.id);

      socket.emit("me-registered", {
        me: socket.id,
      });

      socket.emit("update-user-list", {
        me: socket.id,
        users: this.activeSockets.filter(
          (existingSocket) => existingSocket !== socket.id
        ),
      });

      socket.broadcast.emit("update-user-list", {
        users: [socket.id],
      });
    }

    socket.on("call-user", (data) => {
      socket.to(data.to).emit("call-made", {
        from: socket.id,
        to: data.to,
        offer: data.offer,
        socket: socket.id,
      });
    });

    socket.on("make-answer", (data) => {
      socket.to(data.to).emit("answer-made", {
        from: socket.id,
        to: data.to,
        socket: socket.id,
        answer: data.answer,
      });
    });

    socket.on("reject-call", (data) => {
      socket.to(data.from).emit("call-rejected", {
        from: socket.id,
        to: data.from,
        socket: socket.id,
      });
    });

    socket.on("disconnect", () => {
      this.activeSockets = this.activeSockets.filter(
        (existingSocket) => existingSocket !== socket.id
      );
      socket.broadcast.emit("remove-user", {
        socketId: socket.id,
      });
    });
  }

  public listen(callback: (protocol: string, port: number) => void): void {
    this.httpServer.listen(this.HTTP_PORT, () => {
      callback("http", this.HTTP_PORT);
    });
    this.httpsServer.listen(this.HTTPS_PORT, () => {
      callback("https", this.HTTPS_PORT);
    });
  }
}

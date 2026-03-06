import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(express.json());

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("location-update", (data) => {
      // Broadcast location to everyone in the same room (guardians)
      socket.to(data.roomId).emit("remote-location", data);
    });

    socket.on("sos-activated", (data) => {
      socket.to(data.roomId).emit("sos-alert", data);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Twilio Client (Lazy Initialization)
  let twilioClient: any = null;
  const getTwilioClient = () => {
    if (!twilioClient) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!accountSid || !authToken) {
        throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
      }
      twilioClient = twilio(accountSid, authToken);
    }
    return twilioClient;
  };

  // API Routes
  app.post("/api/send-sms", async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: "Recipient and message are required" });
    }

    try {
      const client = getTwilioClient();
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (!from) {
        throw new Error("TWILIO_PHONE_NUMBER is required");
      }

      const result = await client.messages.create({
        body: message,
        from: from,
        to: to,
      });

      console.log(`SMS sent to ${to}: ${result.sid}`);
      res.json({ success: true, sid: result.sid });
    } catch (error: any) {
      console.error("Twilio Error:", error.message);
      // Fallback for demo purposes if keys are missing
      if (error.message.includes("required")) {
        console.log("SIMULATION: SMS would be sent here if Twilio keys were provided.");
        return res.json({ 
          success: true, 
          simulated: true, 
          message: "SMS simulation successful (Twilio keys missing)" 
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

// server.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const mongoose = require("mongoose");

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/presentation-db", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const presentationSchema = new mongoose.Schema({
  title: String,
});

const slideSchema = new mongoose.Schema({
  presentationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Presentation",
  },
  slideNumber: Number,
  elements: Array, // elements array to store text, images, shapes
});

const Presentation = mongoose.model("Presentation", presentationSchema);
const Slide = mongoose.model("Slide", slideSchema);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const PORT = 3000;

// REST API Routes
app.post("/api/presentations", async (req, res) => {
  try {
    const presentation = new Presentation({ title: "New Presentation" });
    await presentation.save();
    const slide = new Slide({
      presentationId: presentation._id,
      slideNumber: 1,
      elements: [],
    });
    await slide.save();
    res.status(201).json({ presentationId: presentation._id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create presentation." });
  }
});

app.get("/api/presentations/:id", async (req, res) => {
  try {
    const presentation = await Presentation.findById(req.params.id);
    const slides = await Slide.find({
      presentationId: req.params.id,
    }).sort("slideNumber");
    if (!presentation) {
      return res.status(404).json({ error: "Presentation not found." });
    }
    res.status(200).json({
      presentation,
      slides,
    });
  } catch (error) {
    res.status(500).json({
      error: `Cast to ObjectId failed for value "${req.params.id}" (type string) at path "_id" for model "Presentation"`,
    });
  }
});

// WebSocket Connection Logic
wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received message =>", data);

      const { type, presentationId, payload } = data;

      switch (type) {
        case "JOIN_PRESENTATION":
          ws.presentationId = presentationId;
          break;

        case "ADD_ELEMENT":
        case "UPDATE_ELEMENT":
          const updatedSlide = payload.slide;
          await Slide.findByIdAndUpdate(
            updatedSlide._id,
            {
              elements: updatedSlide.elements,
            },
            {
              new: true,
            }
          );
          // Broadcast the updated slide to all clients in the same presentation
          wss.clients.forEach((client) => {
            if (
              client !== ws &&
              client.readyState === WebSocket.OPEN &&
              client.presentationId === presentationId
            ) {
              client.send(
                JSON.stringify({
                  type: "UPDATE_SLIDE",
                  payload: { slide: updatedSlide },
                })
              );
            }
          });
          break;

        // Add the new case for adding a slide
        case "ADD_SLIDE":
          const newSlide = new Slide(payload.slide);
          await newSlide.save();

          wss.clients.forEach((client) => {
            if (
              client.readyState === WebSocket.OPEN &&
              client.presentationId === presentationId
            ) {
              client.send(
                JSON.stringify({
                  type: "NEW_SLIDE_ADDED",
                  payload: { slide: newSlide },
                })
              );
            }
          });
          break;

        default:
          console.warn(`Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error("Error parsing message or updating slide:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`🌐 WebSocket server is running on ws://localhost:${PORT}`);
});

mongoose.connection.on("connected", () => {
  console.log("✅ Connected to MongoDB successfully.");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

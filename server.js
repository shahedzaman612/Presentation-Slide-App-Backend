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

// Presentation schema now includes a 'slides' array
const presentationSchema = new mongoose.Schema({
  title: String,
  slides: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Slide",
    },
  ],
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
    const slide = new Slide({
      presentationId: presentation._id,
      slideNumber: 1,
      elements: [],
    });

    // Add the slide to the presentation
    presentation.slides.push(slide._id);
    await slide.save();
    await presentation.save();

    res.status(201).json({ presentationId: presentation._id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create presentation." });
  }
});

app.get("/api/presentations/:id", async (req, res) => {
  try {
    // Populate the slides array with actual slide data
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

// Helper function to broadcast messages to clients in the same presentation
const broadcastToClients = (presentationId, message) => {
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.presentationId === presentationId
    ) {
      client.send(JSON.stringify(message));
    }
  });
};

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
          broadcastToClients(presentationId, {
            type: "UPDATE_SLIDE",
            payload: { slide: updatedSlide },
          });
          break;

        // Corrected logic for adding a new slide
        case "ADD_SLIDE":
          const newSlideData = payload.slide;
          const newSlide = new Slide(newSlideData);
          await newSlide.save();

          // Find the presentation and add the new slide's ID
          const presentation = await Presentation.findById(presentationId);
          if (presentation) {
            presentation.slides.push(newSlide._id);
            await presentation.save();
          }

          // Fetch all slides to ensure the client has the full, updated list
          const updatedSlides = await Slide.find({ presentationId }).sort(
            "slideNumber"
          );

          // Broadcast the full update to all clients
          broadcastToClients(presentationId, {
            type: "ADD_SLIDE",
            payload: {
              presentation,
              slides: updatedSlides,
            },
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

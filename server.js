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

const presentationUsers = new Map(); // New map to track users by presentationId

// Helper function to broadcast the list of users
const broadcastUserList = (presentationId) => {
  const users = Array.from(presentationUsers.get(presentationId) || []);
  const message = {
    type: "UPDATE_USERS",
    payload: { users },
  };
  broadcastToClients(presentationId, message);
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
          const { userNickname } = payload;
          ws.presentationId = presentationId;
          ws.userNickname = userNickname;

          if (!presentationUsers.has(presentationId)) {
            presentationUsers.set(presentationId, new Set());
          }
          presentationUsers.get(presentationId).add(userNickname);
          broadcastUserList(presentationId);
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
          broadcastToClients(presentationId, {
            type: "UPDATE_SLIDE",
            payload: { slide: updatedSlide },
          });
          break;

        case "DELETE_ELEMENT":
          const slideToDeleteElementFrom = payload.slide;
          await Slide.findByIdAndUpdate(
            slideToDeleteElementFrom._id,
            {
              elements: slideToDeleteElementFrom.elements,
            },
            {
              new: true,
            }
          );
          broadcastToClients(presentationId, {
            type: "UPDATE_SLIDE",
            payload: { slide: slideToDeleteElementFrom },
          });
          break;

        case "ADD_SLIDE":
          const newSlideData = payload.slide;
          const newSlide = new Slide(newSlideData);
          await newSlide.save();

          const presentation = await Presentation.findById(presentationId);
          if (presentation) {
            presentation.slides.push(newSlide._id);
            await presentation.save();
          }

          const updatedSlides = await Slide.find({ presentationId }).sort(
            "slideNumber"
          );

          broadcastToClients(presentationId, {
            type: "UPDATE_SLIDES", // Changed from ADD_SLIDE to UPDATE_SLIDES for a full refresh
            payload: {
              presentation,
              slides: updatedSlides,
            },
          });
          break;

        case "DELETE_SLIDE":
          try {
            const { slideId } = payload;

            // Delete the slide from the 'Slide' collection
            await Slide.findByIdAndDelete(slideId);

            // Remove the slide reference from the parent presentation document
            await Presentation.findByIdAndUpdate(presentationId, {
              $pull: { slides: slideId },
            });

            // Fetch the updated list of slides and broadcast it
            const remainingSlides = await Slide.find({ presentationId }).sort(
              "slideNumber"
            );

            broadcastToClients(presentationId, {
              type: "UPDATE_SLIDES",
              payload: { slides: remainingSlides },
            });
          } catch (error) {
            console.error("Error deleting slide:", error);
          }
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
    if (ws.presentationId && ws.userNickname) {
      const users = presentationUsers.get(ws.presentationId);
      if (users) {
        users.delete(ws.userNickname);
        if (users.size === 0) {
          presentationUsers.delete(ws.presentationId);
        } else {
          broadcastUserList(ws.presentationId);
        }
      }
    }
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

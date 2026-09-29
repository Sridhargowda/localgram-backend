require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jwt-simple');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'localgram_secret_key_123';

// Storage configuration for direct file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/localgram';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.log('MongoDB Connection Error:', err.message));

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  isBanned: { type: Boolean, default: false }
});

const PostSchema = new mongoose.Schema({
  username: String,
  imageUrl: String,
  caption: String,
  likes: { type: Array, default: [] },
  comments: [{ username: String, text: String, createdAt: { type: Date, default: Date.now } }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Post = mongoose.model('Post', PostSchema);

// Ensure uploads directory exists
const fs = require('fs');
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// User Signup & Login
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, phone } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Username taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, phone });
    await newUser.save();
    res.json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Post with Direct File Upload
app.post('/api/posts', upload.single('image'), async (req, res) => {
  try {
    const { username, caption } = req.body;
    const user = await User.findOne({ username });
    if (user && user.isBanned) return res.status(403).json({ error: 'Banned users cannot post' });

    let imageUrl = '';
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const newPost = new Post({ username, imageUrl, caption });
    await newPost.save();
    res.json({ message: 'Post published successfully!', post: newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Feed
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like / Unlike Post
app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const { username } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.likes.includes(username)) {
      post.likes = post.likes.filter(u => u !== username);
    } else {
      post.likes.push(username);
    }
    await post.save();
    res.json({ likesCount: post.likes.length, isLiked: post.likes.includes(username) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Comment
app.post('/api/posts/:id/comment', async (req, res) => {
  try {
    const { username, text } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.comments.push({ username, text });
    await post.save();
    res.json({ comments: post.comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User Search & Profile
app.get('/api/users/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const users = await User.find({ username: { $regex: query,$options: 'i' } }, 'username phone');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }, '-password');
    const posts = await Post.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json({ user, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Control APIs
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ban-user', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBanned = !user.isBanned;
    await user.save();
    res.json({ message: `User ${username} ban status: ${user.isBanned}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/delete-post/:id', async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Local Gram Server running on http://localhost:${PORT}`);
});
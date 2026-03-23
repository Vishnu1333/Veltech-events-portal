require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { collection, getDocs, getDoc, doc, addDoc, deleteDoc, updateDoc, query, where, runTransaction } = require('firebase/firestore');
const { db } = require('./firebase');

const nodemailer = require('nodemailer');

// Configure Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Serve frontend files

// Seed Admin User
async function seedAdminUser() {
  try {
    const adminQ = query(collection(db, "users"), where("email", "==", "admin@veltech.edu.in"));
    const snap = await getDocs(adminQ);
    if (snap.empty) {
        await addDoc(collection(db, "users"), { 
            name: "Admin User", 
            email: "admin@veltech.edu.in", 
            password: "admin123", 
            role: "admin",
            created_at: new Date().toISOString()
        });
        console.log("Firebase: Seeded initial Admin user.");
    }
  } catch (err) {
    console.error("Firebase connection error during seeding:", err.message);
  }
}
seedAdminUser();

// ==== ROUTES ====

// GET all events
app.get('/api/events', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, "events"));
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    events.sort((a,b) => new Date(a.date) - new Date(b.date));
    res.json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch events from Firestore' });
  }
});

// GET single event by ID
app.get('/api/events/:id', async (req, res) => {
  try {
    const docRef = doc(db, "events", req.params.id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return res.status(404).json({ error: 'Event not found' });
    res.json({ id: docSnap.id, ...docSnap.data() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST Login Endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const q = query(collection(db, "users"), where("email", "==", email), where("password", "==", password));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return res.status(401).json({ error: 'Invalid credentials' });
    
    const userDoc = snapshot.docs[0];
    res.json({ message: 'Login successful', user: { id: userDoc.id, ...userDoc.data() } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST to create a new event (Admin)
app.post('/api/events', async (req, res) => {
  const { title, description, date, time, location, category, image_url, speaker, total_seats } = req.body;
  
  if (!title || !date || !time || !location || !total_seats) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newEvent = { 
        title, description, date, time, location, category, 
        image_url: image_url || "", speaker: speaker || "", 
        total_seats: parseInt(total_seats), 
        available_seats: parseInt(total_seats),
        created_at: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, "events"), newEvent);
    res.status(201).json({ id: docRef.id, message: 'Event created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// DELETE an event (Admin)
app.delete('/api/events/:id', async (req, res) => {
  try {
    await deleteDoc(doc(db, "events", req.params.id));
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// POST to register for an event
app.post('/api/register', async (req, res) => {
  const { name, email, phone, department, year, event_id } = req.body;
  
  if (!name || !email || !event_id) {
    return res.status(400).json({ error: 'Name, email and event selection are required' });
  }

  try {
    // 1. Check/create user
    const qUser = query(collection(db, "users"), where("email", "==", email));
    const userSnap = await getDocs(qUser);
    let user_id;
    if (userSnap.empty) {
        const newUser = await addDoc(collection(db, "users"), { name, email, password: 'default_password', role: 'student' });
        user_id = newUser.id;
    } else {
        user_id = userSnap.docs[0].id;
    }

    // 2. Check for duplicate registration
    const qReg = query(collection(db, "registrations"), where("user_id", "==", user_id), where("event_id", "==", event_id));
    const regSnap = await getDocs(qReg);
    if (!regSnap.empty) return res.status(400).json({ error: 'You are already registered for this event' });

    const registration_id = 'VT' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
    const eventRef = doc(db, "events", event_id);

    // 3. Firestore Transaction for atomic logic
    await runTransaction(db, async (transaction) => {
        const eventDoc = await transaction.get(eventRef);
        if (!eventDoc.exists()) throw new Error("Event not found");
        
        const available = parseInt(eventDoc.data().available_seats);
        if (available <= 0) throw new Error("No seats available for this event");
        
        // Update available seats
        transaction.update(eventRef, { available_seats: available - 1 });
        
        // Create registration record
        const newRegRef = doc(collection(db, "registrations"));
        transaction.set(newRegRef, {
            user_id,
            event_id,
            event_title: eventDoc.data().title,
            name,
            email,
            phone: phone || "",
            department: department || "",
            year: year || "",
            registration_id,
            registration_date: new Date().toISOString()
        });
    });
    
    res.status(201).json({ message: 'Registration successful', registration_id });
    
    // Attempt sending confirmation email if credentials exist
    try {
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const mailOptions = {
                from: `"Veltech Event Portal" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Registration Confirmed: ${eventDoc.data().title}`,
                html: `
                    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0c; color: #f5f5f7; padding: 40px; border-radius: 16px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                        <h2 style="color: #fbbf24; margin-top: 20px; font-size: 28px;">You're in!</h2>
                        <p style="font-size: 16px;">Hi <strong>${name}</strong>, you have successfully registered for <strong>${eventDoc.data().title}</strong>.</p>
                        <div style="background: rgba(255,255,255,0.05); padding: 30px; border-radius: 12px; margin: 30px 0; border: 1px dashed rgba(255,255,255,0.2);">
                            <p style="margin: 0; color: #86868b; text-transform: uppercase; letter-spacing: 2px; font-size: 12px;">Registration ID</p>
                            <p style="font-size: 32px; font-weight: 800; margin: 10px 0; color: #fbbf24; font-family: monospace;">${registration_id}</p>
                        </div>
                        <p style="font-size: 16px;"><strong>Venue:</strong> ${eventDoc.data().location}</p>
                        <p style="font-size: 16px;"><strong>Date:</strong> ${eventDoc.data().date} at ${eventDoc.data().time.substring(0,5)}</p>
                        <p style="margin-top: 40px; font-size: 12px; color: #86868b;">Please show this highly secure Registration ID at the venue entrance. See you there!</p>
                    </div>
                `
            };
            transporter.sendMail(mailOptions).catch(err => console.error("Nodemailer rejection:", err));
        }
    } catch(e) { console.error("Email block error", e); }
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// POST to fetch user tickets
app.post('/api/tickets', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const q = query(collection(db, "registrations"), where("email", "==", email));
    const snapshot = await getDocs(q);
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET registrations (Admin)
app.get('/api/registrations', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, "registrations"));
    const regs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    regs.sort((a,b) => new Date(b.registration_date) - new Date(a.registration_date));
    res.json(regs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

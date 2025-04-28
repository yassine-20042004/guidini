const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/guidini')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Configure multer for secure file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, Date.now() + '-' + sanitizedName);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { 
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 2 // Maximum 2 files
    }
});

// Guide Schema with validation
const guideSchema = new mongoose.Schema({
    firstName: { type: String, required: [true, 'First name is required'] },
    lastName: { type: String, required: [true, 'Last name is required'] },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        unique: true,
        validate: {
            validator: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            message: 'Invalid email format'
        }
    },
    phone: { type: String, required: [true, 'Phone number is required'] },
    city: { type: String, required: [true, 'City is required'] },
    age: { 
        type: Number, 
        required: [true, 'Age is required'],
        min: [18, 'Must be at least 18 years old']
    },
    languages: { 
        type: [String], 
        required: [true, 'At least one language is required'],
        validate: {
            validator: v => v.length > 0,
            message: 'At least one language must be selected'
        }
    },
    bio: { 
        type: String, 
        required: [true, 'Bio is required'],
        minlength: [50, 'Bio must be at least 50 characters']
    },
    specialties: {
        type: [String],
        required: [true, 'At least one specialty is required'],
        validate: {
            validator: v => v.length > 0,
            message: 'At least one specialty must be selected'
        }
    },
    experience: { type: String, required: [true, 'Experience level is required'] },
    availability: { type: String, required: [true, 'Availability is required'] },
    startingPrice: { 
        type: Number, 
        required: [true, 'Starting price is required'],
        min: [100, 'Minimum price is 100 MAD']
    },
    transport: { type: String, required: [true, 'Transport option is required'] },
    profilePhoto: { type: String, required: [true, 'Profile photo is required'] },
    idCard: { type: String, required: [true, 'ID card is required'] },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'approved' } // Changed to auto-approve for demo
});

const Guide = mongoose.model('Guide', guideSchema);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Enhanced error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            error: `File upload error: ${err.message}`
        });
    }
    
    res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
    });
});

// Routes
app.get('/api/guides', async (req, res) => {
    try {
        const guides = await Guide.find({ status: 'approved' });
        res.json(guides);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch guides' });
    }
});

// Secure guide registration endpoint
app.post('/api/guides', upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'idCard', maxCount: 1 }
]), async (req, res) => {
    try {
        const { files, body } = req;

        // Validate required files
        if (!files?.profilePhoto?.[0] || !files?.idCard?.[0]) {
            return res.status(400).json({
                success: false,
                error: 'Both profile photo and ID card are required'
            });
        }

        // Process form data with sanitization
        const guideData = {
            firstName: body.firstName?.trim(),
            lastName: body.lastName?.trim(),
            email: body.email?.trim().toLowerCase(),
            phone: body.phone?.trim(),
            city: body.city?.trim(),
            age: parseInt(body.age),
            languages: Array.isArray(body.languages) ? body.languages : [body.languages],
            bio: body.bio?.trim(),
            specialties: Array.isArray(body.specialties) ? body.specialties : [body.specialties],
            experience: body.experience?.trim(),
            availability: body.availability?.trim(),
            startingPrice: parseInt(body.startingPrice),
            transport: body.transport?.trim(),
            profilePhoto: `/uploads/${files.profilePhoto[0].filename}`,
            idCard: `/uploads/${files.idCard[0].filename}`,
            status: 'approved' // Auto-approve new guides for demo
        };

        // Validate numerical values
        if (isNaN(guideData.age) || isNaN(guideData.startingPrice)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid numerical values provided'
            });
        }

        // Create and save new guide
        const newGuide = new Guide(guideData);
        await newGuide.save();

        res.status(201).json({
            success: true,
            message: 'Guide registration successful!',
            redirect: '/index.html', // Redirect to landing page
            guideId: newGuide._id
        });

    } catch (err) {
        console.error('Registration error:', err);
        
        // Handle duplicate email error
        if (err.name === 'MongoServerError' && err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'This email is already registered. Please use a different email address.'
            });
        }

        // Handle validation errors
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                error: errors.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            error: 'Registration failed. Please try again later.'
        });
    }
});

// Admin approval route (protected in production)
app.put('/api/guides/:id/approve', async (req, res) => {
    try {
        const guide = await Guide.findByIdAndUpdate(
            req.params.id,
            { status: 'approved' },
            { new: true, runValidators: true }
        );

        if (!guide) {
            return res.status(404).json({ 
                success: false,
                error: 'Guide not found' 
            });
        }

        res.json({ 
            success: true,
            message: 'Guide approved successfully',
            guide
        });
    } catch (err) {
        console.error('Approval error:', err);
        res.status(500).json({ 
            success: false,
            error: 'Approval failed. Please try again later.' 
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Guide registration: http://localhost:${port}/guideur.html`);
    console.log(`Landing page: http://localhost:${port}/index.html`);
});
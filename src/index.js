const express = require('express');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { S3Client, ListObjectsV2Command, ListBucketsCommand } = require('@aws-sdk/client-s3');
const cors = require('cors');
const awsTestConfig = require('../config/aws-test');

// Load environment variables
dotenv.config();

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create S3 client with IAM role or test credentials
const s3Client = new S3Client(
  process.env.NODE_ENV === 'development' ? awsTestConfig : { region: 'us-east-1' }
);

const app = express();
const port = process.env.PORT || 8080;

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Default to common frontend port
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic route
app.get('/', (req, res) => {
  res.send('Welcome to the Cars API');
});

// Database connection test route
app.get('/db', async (req, res) => {
  const client = await pool.connect();
  try {
    // Test the connection with a simple query
    await client.query('SELECT 1');
    res.json({ status: 'success', message: 'Database connection successful' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// S3 bucket connection test route
app.get('/bucket', async (req, res) => {
  try {
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    res.json({
      status: 'success',
      message: 'S3 bucket connection successful',
      buckets: response.Buckets
    });
  } catch (error) {
    console.error('S3 bucket connection error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'S3 bucket connection failed',
      error: error.message 
    });
  }
});

// Route to fetch cars with their photos
app.get('/cars', async (req, res) => {
  const client = await pool.connect();
  try {
    // Get cars from PostgreSQL
    const carsResult = await client.query('SELECT * FROM cars');
    const cars = carsResult.rows;

    // Get photos from S3
    const s3Command = new ListObjectsV2Command({
      Bucket: 'car-photos-collection'
    });
    
    const s3Response = await s3Client.send(s3Command);
    const photos = s3Response.Contents.map(item => ({
      key: item.Key,
      url: `https://car-photos-collection.s3.amazonaws.com/${item.Key}`
    }));

    // Combine cars with their photos
    const carsWithPhotos = cars.map(car => {
      // Match photos with cars based on the photo key containing the car ID
      const carPhotos = photos.filter(photo => 
        photo.key.includes(car.id.toString())
      );
      return {
        ...car,
        photos: carPhotos
      };
    });

    res.json(carsWithPhotos);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 
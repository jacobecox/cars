const express = require('express');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// Load environment variables
dotenv.config();

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Create S3 client with IAM role
const s3Client = new S3Client({});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Cars API' });
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
    // Test the connection by listing objects in the bucket
    const s3Command = new ListObjectsV2Command({
      Bucket: 'car-photos-collection',
      MaxKeys: 1 // Only fetch 1 object to test the connection
    });
    
    await s3Client.send(s3Command);
    res.json({ 
      status: 'success', 
      message: 'S3 bucket connection successful' 
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
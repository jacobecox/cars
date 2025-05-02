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
  res.json({ message: 'Welcome to the Cars API!' });
});

// Route to fetch cars with their photos
app.get('/cars', async (req, res) => {
  const client = await pool.connect();
  try {
    // Get cars from PostgreSQL
    const carsResult = await client.query('SELECT * FROM cars ORDER BY id');
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
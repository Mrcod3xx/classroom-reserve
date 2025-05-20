<?php
// Database connection parameters
$servername = "localhost";
$username = "root"; // Default XAMPP MySQL username
$password = ""; // Default XAMPP MySQL password is empty
$dbname = "classroom_reservation";

// Create connection
$conn = new mysqli($servername, $username, $password);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Create database if it doesn't exist
$sql = "CREATE DATABASE IF NOT EXISTS $dbname";
if ($conn->query($sql) !== TRUE) {
    die("Error creating database: " . $conn->error);
}

// Select the database
$conn->select_db($dbname);

// Create rooms table if it doesn't exist
$sql = "CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    capacity INT NOT NULL,
    type ENUM('lecture', 'lab', 'exam') NOT NULL,
    features TEXT,
    image TEXT
)";

if ($conn->query($sql) !== TRUE) {
    die("Error creating rooms table: " . $conn->error);
}

// Create reservations table if it doesn't exist
$sql = "CREATE TABLE IF NOT EXISTS reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    is_recurring TINYINT(1) DEFAULT 0,
    recurrence_pattern JSON,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    INDEX idx_room_date (room_id, date),
    INDEX idx_time (start_time, end_time)
)";

if ($conn->query($sql) !== TRUE) {
    die("Error creating reservations table: " . $conn->error);
}

// Check if rooms table is empty, if so, insert sample data
$result = $conn->query("SELECT COUNT(*) as count FROM rooms");
$row = $result->fetch_assoc();

if ($row['count'] == 0) {
    // Insert sample room data
    $rooms = [
        [
            'id' => '101',
            'name' => 'Room 101',
            'capacity' => 45,
            'type' => 'lecture',
            'features' => json_encode(['projector', 'whiteboard']),
            'image' => 'https://via.placeholder.com/300x150?text=Room+101'
        ],
        [
            'id' => '102',
            'name' => 'Room 102',
            'capacity' => 35,
            'type' => 'lecture',
            'features' => json_encode(['projector', 'whiteboard', 'computers']),
            'image' => 'https://via.placeholder.com/300x150?text=Room+102'
        ],
        [
            'id' => '203',
            'name' => 'Lab 203',
            'capacity' => 30,
            'type' => 'lab',
            'features' => json_encode(['projector', 'computers', 'equipment']),
            'image' => 'https://via.placeholder.com/300x150?text=Lab+203'
        ],
        [
            'id' => '305',
            'name' => 'Room 305',
            'capacity' => 70,
            'type' => 'exam',
            'features' => json_encode(['projector', 'whiteboard']),
            'image' => 'https://via.placeholder.com/300x150?text=Room+305'
        ]
    ];

    foreach ($rooms as $room) {
        $sql = "INSERT INTO rooms (id, name, capacity, type, features, image) 
                VALUES ('{$room['id']}', '{$room['name']}', {$room['capacity']}, '{$room['type']}', '{$room['features']}', '{$room['image']}')";
        if ($conn->query($sql) !== TRUE) {
            echo "Error inserting room data: " . $conn->error;
        }
    }

    // Insert sample reservation data
    $reservations = [
        [
            'room_id' => '101',
            'date' => '2025-03-26',
            'start_time' => '10:00',
            'end_time' => '12:00',
            'purpose' => 'Advanced Physics Lecture',
            'is_recurring' => 1,
            'recurrence_pattern' => json_encode([
                'frequency' => 1,
                'unit' => 'week',
                'endDate' => '2025-06-30',
                'daysOfWeek' => ['wed']
            ])
        ],
        [
            'room_id' => '203',
            'date' => '2025-03-27',
            'start_time' => '14:00',
            'end_time' => '16:00',
            'purpose' => 'Chemistry Lab',
            'is_recurring' => 0,
            'recurrence_pattern' => null
        ],
        [
            'room_id' => '305',
            'date' => '2025-03-28',
            'start_time' => '09:00',
            'end_time' => '11:00',
            'purpose' => 'Mid-term Exam',
            'is_recurring' => 0,
            'recurrence_pattern' => null
        ]
    ];

    foreach ($reservations as $reservation) {
        $recurrence = $reservation['recurrence_pattern'] ? "'".$reservation['recurrence_pattern']."'" : "NULL";
        $sql = "INSERT INTO reservations (room_id, date, start_time, end_time, purpose, is_recurring, recurrence_pattern) 
                VALUES ('{$reservation['room_id']}', '{$reservation['date']}', '{$reservation['start_time']}', '{$reservation['end_time']}', '{$reservation['purpose']}', {$reservation['is_recurring']}, {$recurrence})";
        if ($conn->query($sql) !== TRUE) {
            echo "Error inserting reservation data: " . $conn->error;
        }
    }
}
?>
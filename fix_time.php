<?php
require_once 'db_connect.php';

// Fix invalid end time (00:00:00) to 12:00:00
$sql = "UPDATE reservations SET end_time = '12:00:00' WHERE end_time = '00:00:00'";
if ($conn->query($sql)) {
    echo "Fixed invalid end times\n";
}

// Get all reservations to verify
$sql = "SELECT id, room_id, date, start_time, end_time, purpose FROM reservations ORDER BY id";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo "\nCurrent reservations:\n";
    while($row = $result->fetch_assoc()) {
        echo "ID: " . $row["id"] . 
             " | Room: " . $row["room_id"] . 
             " | Date: " . $row["date"] . 
             " | Time: " . $row["start_time"] . " - " . $row["end_time"] . 
             " | Purpose: " . $row["purpose"] . "\n";
    }
} else {
    echo "No reservations found";
}

$conn->close();
?>
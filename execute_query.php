<?php
require_once 'db_connect.php';

// First query: Update reservations with invalid end times
$updateQuery = "UPDATE reservations SET end_time = '12:00:00' WHERE end_time = '00:00:00'";
if ($conn->query($updateQuery)) {
    echo "Successfully updated reservations with invalid end times<br><br>";
} else {
    echo "Error updating reservations: " . $conn->error . "<br><br>";
}

// Second query: Select all reservations
$selectQuery = "SELECT * FROM reservations ORDER BY date, start_time";
$result = $conn->query($selectQuery);

if ($result->num_rows > 0) {
    echo "<h3>Current Reservations:</h3>";
    echo "<table border='1' cellpadding='5'>";
    echo "<tr><th>ID</th><th>Room</th><th>Date</th><th>Start Time</th><th>End Time</th><th>Purpose</th><th>Is Recurring</th></tr>";
    
    while($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td>" . $row["id"] . "</td>";
        echo "<td>" . $row["room_id"] . "</td>";
        echo "<td>" . $row["date"] . "</td>";
        echo "<td>" . $row["start_time"] . "</td>";
        echo "<td>" . $row["end_time"] . "</td>";
        echo "<td>" . $row["purpose"] . "</td>";
        echo "<td>" . ($row["is_recurring"] ? "Yes" : "No") . "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "No reservations found";
}

$conn->close();
?>
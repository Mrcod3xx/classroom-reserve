<?php
// Debug output for comprehensive diagnosis
header("Content-Type: text/html");
echo "<html><head><title>Comprehensive Reservation Fixer</title></head><body>";
echo "<h1>Classroom Reservation System - Database Repair Utility</h1>";

// Include database connection
require_once 'db_connect.php';

// Function to show all reservations
function displayAllReservations($conn) {
    $sql = "SELECT * FROM reservations ORDER BY date, start_time";
    $result = $conn->query($sql);
    
    echo "<h2>All Reservations in Database</h2>";
    if ($result->num_rows > 0) {
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
        echo "<p>No reservations found in database.</p>";
    }
}

// STEP 1: Display current state of reservations
echo "<h3>STEP 1: Current State Before Fixes</h3>";
displayAllReservations($conn);

// STEP 2: Fix invalid end times
echo "<h3>STEP 2: Fixing Invalid End Times</h3>";
$sql = "UPDATE reservations SET end_time = '12:00:00' WHERE end_time = '00:00:00'";
if ($conn->query($sql)) {
    echo "<p style='color:green'>✓ Successfully updated reservations with invalid end times</p>";
} else {
    echo "<p style='color:red'>✗ Error updating reservations: " . $conn->error . "</p>";
}

// STEP 3: Verify all reservations have valid rooms
echo "<h3>STEP 3: Verifying Room Validity</h3>";
$sql = "SELECT r.id, r.room_id FROM reservations r 
        LEFT JOIN rooms rm ON r.room_id = rm.id 
        WHERE rm.id IS NULL";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo "<p style='color:red'>Found " . $result->num_rows . " reservations with invalid room references. Fixing...</p>";
    
    // Get a valid room ID to use
    $roomSql = "SELECT id FROM rooms LIMIT 1";
    $roomResult = $conn->query($roomSql);
    $validRoom = $roomResult->fetch_assoc()['id'];
    
    while($row = $result->fetch_assoc()) {
        $updateSql = "UPDATE reservations SET room_id = '$validRoom' WHERE id = " . $row['id'];
        if ($conn->query($updateSql)) {
            echo "<p>- Fixed reservation ID " . $row['id'] . " - assigned to room $validRoom</p>";
        } else {
            echo "<p style='color:red'>- Failed to fix reservation ID " . $row['id'] . ": " . $conn->error . "</p>";
        }
    }
} else {
    echo "<p style='color:green'>✓ All reservations have valid room references</p>";
}

// STEP 4: Verify all dates are valid
echo "<h3>STEP 4: Verifying Date Validity</h3>";
$sql = "SELECT id, date FROM reservations WHERE date NOT LIKE '____-__-__'";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    echo "<p style='color:red'>Found " . $result->num_rows . " reservations with invalid dates. Fixing...</p>";
    
    // Set today as a valid date
    $validDate = date('Y-m-d');
    
    while($row = $result->fetch_assoc()) {
        $updateSql = "UPDATE reservations SET date = '$validDate' WHERE id = " . $row['id'];
        if ($conn->query($updateSql)) {
            echo "<p>- Fixed reservation ID " . $row['id'] . " - set date to $validDate</p>";
        } else {
            echo "<p style='color:red'>- Failed to fix reservation ID " . $row['id'] . ": " . $conn->error . "</p>";
        }
    }
} else {
    echo "<p style='color:green'>✓ All reservations have valid dates</p>";
}

// STEP 5: Create test reservations to verify system works
echo "<h3>STEP 5: Creating Test Reservations</h3>";

// Get room IDs
$roomSql = "SELECT id FROM rooms ORDER BY id";
$roomResult = $conn->query($roomSql);
$rooms = [];
while($row = $roomResult->fetch_assoc()) {
    $rooms[] = $row['id'];
}

if (count($rooms) > 0) {
    $today = date('Y-m-d');
    $tomorrow = date('Y-m-d', strtotime('+1 day'));
    
    // Create two test reservations
    $testReservations = [
        [
            'room_id' => $rooms[0],
            'date' => $today,
            'start_time' => '14:00:00',
            'end_time' => '15:00:00',
            'purpose' => 'TEST - Today Meeting',
            'is_recurring' => 0
        ],
        [
            'room_id' => $rooms[count($rooms) > 1 ? 1 : 0],
            'date' => $tomorrow,
            'start_time' => '10:00:00',
            'end_time' => '11:30:00',
            'purpose' => 'TEST - Tomorrow Class',
            'is_recurring' => 0
        ]
    ];
    
    foreach($testReservations as $reservation) {
        $sql = "INSERT INTO reservations (room_id, date, start_time, end_time, purpose, is_recurring) 
                VALUES ('{$reservation['room_id']}', '{$reservation['date']}', '{$reservation['start_time']}', 
                        '{$reservation['end_time']}', '{$reservation['purpose']}', {$reservation['is_recurring']})";
        
        if ($conn->query($sql)) {
            echo "<p style='color:green'>✓ Created test reservation in Room {$reservation['room_id']} on {$reservation['date']}</p>";
        } else {
            echo "<p style='color:red'>✗ Failed to create test reservation: " . $conn->error . "</p>";
        }
    }
} else {
    echo "<p style='color:red'>✗ No rooms found in database</p>";
}

// STEP 6: Final verification
echo "<h3>STEP 6: Final State After Fixes</h3>";
displayAllReservations($conn);

// STEP 7: Check if the modal exists in the HTML
echo "<h3>STEP 7: Checking HTML Structure</h3>";

$htmlFile = file_get_contents('index.html');

$missingElements = [];

if (strpos($htmlFile, 'id="conflictModal"') === false) {
    $missingElements[] = 'Conflict Modal';
}

if (count($missingElements) > 0) {
    echo "<p style='color:red'>✗ Missing HTML elements: " . implode(", ", $missingElements) . "</p>";
    echo "<p>Please check if you've added all the necessary HTML components.</p>";
} else {
    echo "<p style='color:green'>✓ All expected HTML elements found</p>";
}

// STEP 8: Recommendations
echo "<h3>STEP 8: Recommendations</h3>";
echo "<ol>";
echo "<li>Before editing any reservation, <strong>refresh the page</strong> first to ensure you're working with the latest data.</li>";
echo "<li>Try using a different browser if you still have issues.</li>";
echo "<li>When clicking 'Edit' on a reservation, check that the form is populating properly.</li>";
echo "<li>After completing your edits, wait for the success message before navigating away.</li>";
echo "</ol>";

// STEP 9: JS Diagnostics
echo "<h3>STEP 9: JavaScript Diagnostics Information</h3>";
echo "<p>This information can be useful for debugging:</p>";
echo "<pre>";
echo "Application Version: Classroom Reservation System 1.0\n";
echo "Fix Date: " . date('Y-m-d H:i:s') . "\n";
echo "PHP Version: " . phpversion() . "\n";
echo "MySQL Version: " . $conn->server_info . "\n"; 
echo "</pre>";

// Close the connection
$conn->close();

echo "<p style='margin-top: 20px; font-weight: bold;'>All repairs completed. Please return to the main application and refresh your browser.</p>";
echo "<p><a href='index.html' style='text-decoration: none; display: inline-block; padding: 10px 15px; background-color: #0d6efd; color: white; border-radius: 4px;'>Return to Reservation System</a></p>";
echo "</body></html>";
?>
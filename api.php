<?php
// Set headers for JSON API
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Include database connection
require_once 'db_connect.php';

// Get the request method
$method = $_SERVER['REQUEST_METHOD'];

// Get the endpoint from the URL
$endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';

// Process the request based on the HTTP method and endpoint
switch ($method) {
    case 'GET':
        // GET requests - fetch data
        if ($endpoint === 'rooms') {
            // Get all rooms
            $sql = "SELECT id, name, capacity, type, features, image FROM rooms";
            $result = $conn->query($sql);
            
            $rooms = [];
            while ($row = $result->fetch_assoc()) {
                $row['features'] = json_decode($row['features']);
                $rooms[] = $row;
            }
            
            echo json_encode(['status' => 'success', 'data' => $rooms]);
        } 
        elseif ($endpoint === 'reservations') {
            // Get single reservation if ID is provided
            if (isset($_GET['id'])) {
                $id = $conn->real_escape_string($_GET['id']);
                $sql = "SELECT r.*, rm.name as room_name 
                        FROM reservations r 
                        JOIN rooms rm ON r.room_id = rm.id 
                        WHERE r.id = $id";
                $result = $conn->query($sql);
                
                if ($result->num_rows > 0) {
                    $reservation = $result->fetch_assoc();
                    $reservation['is_recurring'] = (bool)$reservation['is_recurring'];
                    if ($reservation['recurrence_pattern']) {
                        $reservation['recurrence_pattern'] = json_decode($reservation['recurrence_pattern']);
                    }
                    echo json_encode(['status' => 'success', 'data' => $reservation]);
                } else {
                    echo json_encode(['status' => 'error', 'message' => 'Reservation not found']);
                }
            } else {
                // Get all reservations
                $sql = "SELECT id, room_id, date, start_time, end_time, purpose, is_recurring, recurrence_pattern FROM reservations";
                $result = $conn->query($sql);
                
                $reservations = [];
                while ($row = $result->fetch_assoc()) {
                    $row['is_recurring'] = (bool)$row['is_recurring'];
                    if ($row['recurrence_pattern']) {
                        $row['recurrence_pattern'] = json_decode($row['recurrence_pattern']);
                    }
                    $reservations[] = $row;
                }
                
                echo json_encode(['status' => 'success', 'data' => $reservations]);
            }
        }
        else {
            echo json_encode(['status' => 'error', 'message' => 'Invalid endpoint']);
        }
        break;
        
    case 'POST':
        // POST requests - create new data
        $data = json_decode(file_get_contents("php://input"), true);
        
        if ($endpoint === 'reservations') {
            // Create new reservation
            if (
                !isset($data['roomId']) || 
                !isset($data['date']) || 
                !isset($data['startTime']) || 
                !isset($data['endTime'])
            ) {
                echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
                exit;
            }
            
            $roomId = $conn->real_escape_string($data['roomId']);
            $date = $conn->real_escape_string($data['date']);
            $startTime = $conn->real_escape_string($data['startTime']);
            $endTime = $conn->real_escape_string($data['endTime']);
            
            // Handle midnight time properly
            if ($endTime === '00:00:00' || $endTime === '00:00') {
                $endTime = '24:00:00';
            }
            
            // Normalize time format
            if (strlen($startTime) === 5) {
                $startTime .= ':00';
            }
            if (strlen($endTime) === 5) {
                $endTime .= ':00';
            }
            
            // Enhanced conflict detection query - more explicit with all possible overlapping scenarios
            $sql = "SELECT r.*, rm.name as room_name 
                    FROM reservations r 
                    JOIN rooms rm ON r.room_id = rm.id 
                    WHERE r.room_id = '$roomId' 
                    AND r.date = '$date' 
                    AND (
                        /* Case 1: New reservation completely contains an existing reservation */
                        ('$startTime' <= r.start_time AND '$endTime' >= r.end_time)
                        
                        /* Case 2: New reservation is completely contained within an existing reservation */
                        OR ('$startTime' >= r.start_time AND '$endTime' <= r.end_time)
                        
                        /* Case 3: New reservation starts during an existing reservation */
                        OR ('$startTime' >= r.start_time AND '$startTime' < r.end_time)
                        
                        /* Case 4: New reservation ends during an existing reservation */
                        OR ('$endTime' > r.start_time AND '$endTime' <= r.end_time)
                    )";

            // Add exclusion for edits
            if (isset($data['excludeId'])) {
                $excludeId = $conn->real_escape_string($data['excludeId']);
                $sql .= " AND r.id != $excludeId";
            }
            
            $result = $conn->query($sql);
            
            if ($result->num_rows > 0) {
                // There is a conflict - get details and alternatives
                $conflict = $result->fetch_assoc();
                
                // Find alternative times
                $altTimesSql = "SELECT MIN(end_time) as next_available
                               FROM reservations 
                               WHERE room_id = '$roomId' 
                               AND date = '$date' 
                               AND start_time >= '$endTime'";
                $altTimesResult = $conn->query($altTimesSql);
                $nextSlot = $altTimesResult->fetch_assoc();
                
                // Find alternative rooms
                $altRoomsSql = "SELECT DISTINCT r.id, r.name, r.capacity
                               FROM rooms r
                               WHERE r.id != '$roomId'
                               AND NOT EXISTS (
                                   SELECT 1 FROM reservations res
                                   WHERE res.room_id = r.id
                                   AND res.date = '$date'
                                   AND res.start_time < '$endTime'
                                   AND res.end_time > '$startTime'
                               )";
                $altRoomsResult = $conn->query($altRoomsSql);
                $alternativeRooms = [];
                while ($room = $altRoomsResult->fetch_assoc()) {
                    $alternativeRooms[] = $room;
                }
                
                echo json_encode([
                    'status' => 'error',
                    'message' => 'Scheduling conflict detected',
                    'conflict' => [
                        'existing_reservation' => [
                            'room_name' => $conflict['room_name'],
                            'start_time' => $conflict['start_time'],
                            'end_time' => $conflict['end_time'],
                            'purpose' => $conflict['purpose']
                        ],
                        'next_available_time' => $nextSlot['next_available'],
                        'alternative_rooms' => $alternativeRooms
                    ]
                ]);
                exit;
            }
            
            // If no conflicts found, return success for conflict check
            if (isset($data['_checkOnly']) && $data['_checkOnly']) {
                echo json_encode(['status' => 'success', 'message' => 'No conflicts found']);
                exit;
            }
            
            // Otherwise, proceed with creating the reservation
            if (!isset($data['purpose'])) {
                echo json_encode(['status' => 'error', 'message' => 'Missing purpose field']);
                exit;
            }
            
            $purpose = $conn->real_escape_string($data['purpose']);
            $isRecurring = isset($data['isRecurring']) ? ($data['isRecurring'] ? 1 : 0) : 0;
            
            // Handle recurrence pattern
            $recurrencePattern = null;
            if ($isRecurring && isset($data['recurrencePattern'])) {
                $recurrencePattern = json_encode($data['recurrencePattern']);
            }
            
            // Insert into database
            $recurrenceValue = $recurrencePattern ? "'$recurrencePattern'" : "NULL";
            $sql = "INSERT INTO reservations (room_id, date, start_time, end_time, purpose, is_recurring, recurrence_pattern) 
                   VALUES ('$roomId', '$date', '$startTime', '$endTime', '$purpose', $isRecurring, $recurrenceValue)";
                   
            if ($conn->query($sql)) {
                $newId = $conn->insert_id;
                echo json_encode(['status' => 'success', 'message' => 'Reservation created', 'id' => $newId]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $conn->error]);
            }
        }
        else {
            echo json_encode(['status' => 'error', 'message' => 'Invalid endpoint']);
        }
        break;
        
    case 'PUT':
        // PUT requests - update existing data
        $data = json_decode(file_get_contents("php://input"), true);
        
        if ($endpoint === 'reservations' && isset($_GET['id'])) {
            $id = $conn->real_escape_string($_GET['id']);
            
            // Make sure the reservation exists
            $checkSql = "SELECT id FROM reservations WHERE id = $id";
            $result = $conn->query($checkSql);
            
            if ($result->num_rows === 0) {
                echo json_encode(['status' => 'error', 'message' => 'Reservation not found']);
                exit;
            }
            
            // Build update query
            $updateFields = [];
            
            if (isset($data['roomId'])) {
                $roomId = $conn->real_escape_string($data['roomId']);
                $updateFields[] = "room_id = '$roomId'";
            }
            
            if (isset($data['date'])) {
                $date = $conn->real_escape_string($data['date']);
                $updateFields[] = "date = '$date'";
            }
            
            if (isset($data['startTime'])) {
                $startTime = $conn->real_escape_string($data['startTime']);
                $updateFields[] = "start_time = '$startTime'";
            }
            
            if (isset($data['endTime'])) {
                $endTime = $conn->real_escape_string($data['endTime']);
                $updateFields[] = "end_time = '$endTime'";
            }
            
            if (isset($data['purpose'])) {
                $purpose = $conn->real_escape_string($data['purpose']);
                $updateFields[] = "purpose = '$purpose'";
            }
            
            if (isset($data['isRecurring'])) {
                $isRecurring = $data['isRecurring'] ? 1 : 0;
                $updateFields[] = "is_recurring = $isRecurring";
            }
            
            if (isset($data['recurrencePattern'])) {
                $recurrencePattern = json_encode($data['recurrencePattern']);
                $updateFields[] = "recurrence_pattern = '$recurrencePattern'";
            }
            
            if (empty($updateFields)) {
                echo json_encode(['status' => 'error', 'message' => 'No fields to update']);
                exit;
            }
            
            $updateFieldsStr = implode(', ', $updateFields);
            $sql = "UPDATE reservations SET $updateFieldsStr WHERE id = $id";
            
            if ($conn->query($sql)) {
                echo json_encode(['status' => 'success', 'message' => 'Reservation updated']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $conn->error]);
            }
        }
        else {
            echo json_encode(['status' => 'error', 'message' => 'Invalid endpoint or missing ID']);
        }
        break;
        
    case 'DELETE':
        // DELETE requests - delete data
        if ($endpoint === 'reservations' && isset($_GET['id'])) {
            $id = $conn->real_escape_string($_GET['id']);
            
            $sql = "DELETE FROM reservations WHERE id = $id";
            
            if ($conn->query($sql)) {
                echo json_encode(['status' => 'success', 'message' => 'Reservation deleted']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $conn->error]);
            }
        }
        else {
            echo json_encode(['status' => 'error', 'message' => 'Invalid endpoint or missing ID']);
        }
        break;
        
    default:
        echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
        break;
}

// Close the connection
$conn->close();
?>
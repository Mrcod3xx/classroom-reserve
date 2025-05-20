// Classroom Reservation System - Main JavaScript

// API endpoints
const API_BASE_URL = 'api.php';

// Helper functions
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// API functions
async function getRooms() {
    try {
        const response = await fetch(`${API_BASE_URL}?endpoint=rooms`);
        const data = await response.json();
        
        if (data.status === 'success') {
            return data.data;
        } else {
            console.error('Error fetching rooms:', data.message);
            return [];
        }
    } catch (error) {
        console.error('API Error:', error);
        return [];
    }
}

async function getReservations() {
    try {
        // Add a cache-busting parameter to prevent browser caching
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_BASE_URL}?endpoint=reservations&_=${timestamp}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Transform and validate the data
            return data.data
                .filter(reservation => {
                    // No longer filtering out reservations with invalid times since they're fixed
                    return true;
                })
                .map(reservation => ({
                    id: reservation.id,
                    roomId: reservation.room_id,
                    date: reservation.date,
                    startTime: reservation.start_time,
                    endTime: reservation.end_time,
                    purpose: reservation.purpose,
                    isRecurring: reservation.is_recurring,
                    recurrencePattern: reservation.recurrence_pattern
                }));
        } else {
            console.error('Error fetching reservations:', data.message);
            return [];
        }
    } catch (error) {
        console.error('API Error:', error);
        return [];
    }
}

async function saveReservation(reservationData) {
    try {
        const response = await fetch(`${API_BASE_URL}?endpoint=reservations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reservationData)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Add the ID assigned by the database to our reservation object
            return { ...reservationData, id: data.id };
        } else {
            console.error('Error saving reservation:', data.message);
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function updateReservation(id, reservationData) {
    try {
        const response = await fetch(`${API_BASE_URL}?endpoint=reservations&id=${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reservationData)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            return true;
        } else {
            console.error('Error updating reservation:', data.message);
            return false;
        }
    } catch (error) {
        console.error('API Error:', error);
        return false;
    }
}

async function deleteReservation(id) {
    try {
        const response = await fetch(`${API_BASE_URL}?endpoint=reservations&id=${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            return true;
        } else {
            console.error('Error deleting reservation:', data.message);
            return false;
        }
    } catch (error) {
        console.error('API Error:', error);
        return false;
    }
}

// Conflict detection function
async function hasSchedulingConflict(roomId, date, startTime, endTime, excludeReservationId = null) {
    try {
        // Make API call to check for conflicts
        const response = await fetch(`${API_BASE_URL}?endpoint=reservations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomId,
                date,
                startTime,
                endTime,
                purpose: 'conflict-check',
                _checkOnly: true,
                excludeId: excludeReservationId
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'error' && data.conflict) {
            // Show conflict modal with conflict data
            await showConflictModal(data.conflict);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking for scheduling conflicts:', error);
        alert('Error checking for scheduling conflicts. Please try again.');
        return false;
    }
}

// Show conflict modal with details and alternatives
async function showConflictModal(conflictData) {
    const conflictModal = new bootstrap.Modal(document.getElementById('conflictModal'));
    const modalBody = document.querySelector('#conflictModal .modal-body');
    
    // Update conflict message with specific details
    modalBody.innerHTML = `
        <div class="alert alert-warning">
            <h6>Scheduling Conflict</h6>
            <p>The room is already booked during this time:</p>
            <ul>
                <li>Room: ${conflictData.existing_reservation.room_name}</li>
                <li>Time: ${formatTime(conflictData.existing_reservation.start_time)} - ${formatTime(conflictData.existing_reservation.end_time)}</li>
                <li>Purpose: ${conflictData.existing_reservation.purpose}</li>
            </ul>
        </div>
        
        <h6>Alternative Times:</h6>
        <div class="list-group mb-3" id="alternative-times">
            ${conflictData.next_available_time ? 
                `<a href="#" class="list-group-item list-group-item-action alternative-time" 
                    data-start="${conflictData.next_available_time}">
                    Same room at ${formatTime(conflictData.next_available_time)}
                </a>` : 
                '<p class="text-muted">No alternative times available for this date</p>'
            }
        </div>
        
        <h6>Alternative Rooms:</h6>
        <div class="list-group" id="alternative-rooms">
            ${conflictData.alternative_rooms && conflictData.alternative_rooms.length > 0 ? 
                conflictData.alternative_rooms.map(room => `
                    <a href="#" class="list-group-item list-group-item-action alternative-room" 
                       data-room="${room.id}" data-room-name="${room.name}">
                        ${room.name} (Capacity: ${room.capacity})
                    </a>
                `).join('') : 
                '<p class="text-muted">No alternative rooms available for this time slot</p>'
            }
        </div>
    `;
    
    // Add event listeners to alternative time slots
    document.querySelectorAll('.alternative-time').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const startTime = this.getAttribute('data-start');
            // Calculate end time based on the original duration
            const originalStart = new Date(`2000-01-01T${document.getElementById('start-time').value}`);
            const originalEnd = new Date(`2000-01-01T${document.getElementById('end-time').value}`);
            const duration = originalEnd - originalStart;
            
            const newStart = new Date(`2000-01-01T${startTime}`);
            const newEnd = new Date(newStart.getTime() + duration);
            const endTime = newEnd.toTimeString().slice(0, 5);
            
            // Update the form
            document.getElementById('start-time').value = startTime;
            document.getElementById('end-time').value = endTime;
            
            // Close the modal
            conflictModal.hide();
        });
    });
    
    // Add event listeners to alternative rooms
    document.querySelectorAll('.alternative-room').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const roomId = this.getAttribute('data-room');
            const roomName = this.getAttribute('data-room-name');
            
            // Update the form
            document.getElementById('room-select').value = roomId;
            
            // Close the modal
            conflictModal.hide();
            
            // Show success message
            alert(`Room changed to ${roomName}. Click 'Check Availability' to verify the new room's availability.`);
        });
    });
    
    // Show the modal
    conflictModal.show();
}

// Helper functions for alternative suggestions
async function findAlternativeTimes(roomId, date, duration) {
    try {
        const reservations = await getReservations();
        const roomReservations = reservations.filter(r => r.roomId === roomId && r.date === date);
        const alternatives = [];
        const openHours = { 
            start: 7.5, // 7:30 AM
            end: 22    // 10:00 PM
        };
        const durationMinutes = duration;
        const durationHours = durationMinutes / 60;
        
        // Sort reservations by startTime
        roomReservations.sort((a, b) => {
            return a.startTime.localeCompare(b.startTime);
        });
        
        // Find available time slots
        let currentTime = openHours.start;
        
        // Check if there's an available slot before the first reservation
        if (roomReservations.length > 0) {
            const firstReservationStart = parseInt(roomReservations[0].startTime.split(':')[0]);
            if (firstReservationStart - currentTime >= durationHours) {
                alternatives.push({
                    startTime: `${currentTime.toString().padStart(2, '0')}:00`,
                    endTime: `${(firstReservationStart).toString().padStart(2, '0')}:00`
                });
            }
            
            // Check for slots between reservations
            for (let i = 0; i < roomReservations.length - 1; i++) {
                const currentEndHour = parseInt(roomReservations[i].endTime.split(':')[0]);
                const currentEndMinute = parseInt(roomReservations[i].endTime.split(':')[1]);
                const nextStartHour = parseInt(roomReservations[i + 1].startTime.split(':')[0]);
                const nextStartMinute = parseInt(roomReservations[i + 1].startTime.split(':')[1]);
                
                // Calculate gap in minutes
                const gapMinutes = (nextStartHour * 60 + nextStartMinute) - (currentEndHour * 60 + currentEndMinute);
                
                if (gapMinutes >= durationMinutes) {
                    alternatives.push({
                        startTime: roomReservations[i].endTime,
                        endTime: roomReservations[i + 1].startTime
                    });
                }
            }
            
            // Check if there's an available slot after the last reservation
            const lastReservationEndHour = parseInt(roomReservations[roomReservations.length - 1].endTime.split(':')[0]);
            const lastReservationEndMinute = parseInt(roomReservations[roomReservations.length - 1].endTime.split(':')[1]);
            
            const remainingMinutes = (openHours.end * 60) - (lastReservationEndHour * 60 + lastReservationEndMinute);
            
            if (remainingMinutes >= durationMinutes) {
                alternatives.push({
                    startTime: roomReservations[roomReservations.length - 1].endTime,
                    endTime: `${openHours.end.toString().padStart(2, '0')}:00`
                });
            }
        } else {
            // No reservations for this room on this day
            alternatives.push({
                startTime: `${openHours.start.toString().padStart(2, '0')}:00`,
                endTime: `${openHours.end.toString().padStart(2, '0')}:00`
            });
        }
        
        return alternatives;
    } catch (error) {
        console.error('Error finding alternative times:', error);
        return [];
    }
}

async function findAlternativeRooms(date, startTime, endTime, excludeRoomId) {
    try {
        const rooms = await getRooms();
        const alternatives = [];
        
        // For each room (except the excluded one)
        for (const room of rooms) {
            if (room.id !== excludeRoomId) {
                // Check if the room is available at the requested time
                const conflict = await hasRoomConflict(room.id, date, startTime, endTime);
                if (!conflict) {
                    alternatives.push(room);
                }
            }
        }
        
        return alternatives;
    } catch (error) {
        console.error('Error finding alternative rooms:', error);
        return [];
    }
}

async function hasRoomConflict(roomId, date, startTime, endTime) {
    try {
        const reservations = await getReservations();
        
        // Normalize time formats
        let normalizedStartTime = startTime;
        let normalizedEndTime = endTime;
        
        // Convert 00:00 to 24:00 for midnight
        if (normalizedEndTime === '00:00' || normalizedEndTime === '00:00:00') {
            normalizedEndTime = '24:00';
        }
        
        // Add seconds if needed
        if (normalizedStartTime.length === 5) normalizedStartTime += ':00';
        if (normalizedEndTime.length === 5) normalizedEndTime += ':00';
        
        return reservations.some(reservation => {
            if (reservation.roomId === roomId && reservation.date === date) {
                // Normalize existing reservation time
                let reservationStart = reservation.startTime;
                let reservationEnd = reservation.endTime;
                
                if (reservationEnd === '00:00' || reservationEnd === '00:00:00') {
                    reservationEnd = '24:00';
                }
                
                if (reservationStart.length === 5) reservationStart += ':00';
                if (reservationEnd.length === 5) reservationEnd += ':00';
                
                // Check all four overlap scenarios
                
                // Case 1: New reservation completely contains an existing reservation
                const case1 = normalizedStartTime <= reservationStart && normalizedEndTime >= reservationEnd;
                
                // Case 2: New reservation is completely contained within an existing reservation
                const case2 = normalizedStartTime >= reservationStart && normalizedEndTime <= reservationEnd;
                
                // Case 3: New reservation starts during an existing reservation
                const case3 = normalizedStartTime >= reservationStart && normalizedStartTime < reservationEnd;
                
                // Case 4: New reservation ends during an existing reservation
                const case4 = normalizedEndTime > reservationStart && normalizedEndTime <= reservationEnd;
                
                return case1 || case2 || case3 || case4;
            }
            return false;
        });
    } catch (error) {
        console.error('Error checking room conflict:', error);
        return true; // Assume conflict on error for safety
    }
}

// UI functions
async function updateDashboardStats() {
    try {
        const reservations = await getReservations();
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Calculate upcoming reservations
        const upcomingCount = reservations.filter(r => r.date >= currentDate).length;
        
        // Calculate total reservations
        const totalCount = reservations.length;
        
        // Calculate recurring series
        const recurringCount = reservations.filter(r => r.isRecurring).length;
        
        // Calculate different rooms used
        const uniqueRooms = new Set(reservations.map(r => r.roomId)).size;
        
        // Update the dashboard stats
        document.querySelector('[data-stat="upcoming"]').textContent = upcomingCount;
        document.querySelector('[data-stat="total"]').textContent = totalCount;
        document.querySelector('[data-stat="recurring"]').textContent = recurringCount;
        document.querySelector('[data-stat="rooms"]').textContent = uniqueRooms;
    } catch (error) {
        console.error('Error updating dashboard stats:', error);
    }
}

// Original populateUpcomingReservations function
async function populateUpcomingReservations() {
    try {
        const reservations = await getReservations();
        const upcomingReservationsList = document.getElementById('upcoming-reservations');
        const rooms = await getRooms();
        
        // Clear the current reservations
        upcomingReservationsList.innerHTML = '';
        
        // Get current date for filtering upcoming reservations
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Filter and sort upcoming reservations
        const upcomingReservations = reservations
            .filter(reservation => reservation.date >= currentDate)
            .sort((a, b) => new Date(`${a.date}T${a.startTime}`) - new Date(`${b.date}T${b.startTime}`));
        
        upcomingReservations.forEach(reservation => {
            const room = rooms.find(r => r.id === reservation.roomId);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${room ? room.name : 'Unknown Room'}</td>
                <td>${formatDate(reservation.date)}</td>
                <td>${formatTime(reservation.startTime)} - ${formatTime(reservation.endTime)}</td>
                <td>${reservation.purpose}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-reservation" data-id="${reservation.id}">Edit</button>
                    <button class="btn btn-sm btn-outline-danger delete-reservation" data-id="${reservation.id}">Cancel</button>
                </td>
            `;
            
            upcomingReservationsList.appendChild(tr);
        });
        
        // Add event listeners to buttons
        document.querySelectorAll('.edit-reservation').forEach(button => {
            button.addEventListener('click', function() {
                const reservationId = parseInt(this.getAttribute('data-id'));
                editReservation(reservationId);
            });
        });
        
        document.querySelectorAll('.delete-reservation').forEach(button => {
            button.addEventListener('click', async function() {
                const reservationId = parseInt(this.getAttribute('data-id'));
                if (confirm('Are you sure you want to cancel this reservation?')) {
                    const success = await deleteReservation(reservationId);
                    if (success) {
                        populateUpcomingReservations();
                        initializeCalendar();
                        updateDashboardStats(); // Update stats after deletion
                    } else {
                        alert('Failed to delete reservation. Please try again.');
                    }
                }
            });
        });

        // Update dashboard stats after populating reservations
        updateDashboardStats();
    } catch (error) {
        console.error('Error populating reservations:', error);
    }
}

async function populateRoomsList() {
    try {
        const rooms = await getRooms();
        const roomsList = document.getElementById('room-list');
        
        // Clear the current rooms
        roomsList.innerHTML = '';
        
        rooms.forEach(room => {
            // Create room card
            const roomCard = document.createElement('div');
            roomCard.className = 'col-md-4 mb-4';
            
            // Room type label
            let typeLabel = '';
            let typeBadge = '';
            
            switch (room.type) {
                case 'lecture':
                    typeLabel = 'Lecture Hall';
                    typeBadge = 'bg-success';
                    break;
                case 'lab':
                    typeLabel = 'Laboratory';
                    typeBadge = 'bg-warning';
                    break;
                case 'exam':
                    typeLabel = 'Exam Room';
                    typeBadge = 'bg-danger';
                    break;
                default:
                    typeLabel = 'Classroom';
                    typeBadge = 'bg-info';
            }
            
            // Feature badges
            let featureBadges = '';
            if (room.features && room.features.length > 0) {
                room.features.forEach(feature => {
                    let featureLabel = feature.charAt(0).toUpperCase() + feature.slice(1);
                    featureBadges += `<span class="badge bg-info feature-tag">${featureLabel}</span>`;
                });
            }
            
            roomCard.innerHTML = `
                <div class="card room-card">
                    <img src="${room.image}" class="card-img-top" alt="${room.name}">
                    <div class="card-body">
                        <h5 class="card-title">${room.name}</h5>
                        <p class="card-text">Capacity: ${room.capacity} students</p>
                        <div class="mb-2">
                            ${featureBadges}
                            <span class="badge ${typeBadge} feature-tag">${typeLabel}</span>
                        </div>
                        <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#reservationModal" data-room="${room.id}">Reserve Now</button>
                        <button class="btn btn-outline-secondary btn-sm view-room-details" data-room="${room.id}">Room Details</button>
                    </div>
                </div>
            `;
            
            roomsList.appendChild(roomCard);
        });
        
        // Add event listeners to view room details buttons
        document.querySelectorAll('.view-room-details').forEach(button => {
            button.addEventListener('click', function() {
                const roomId = this.getAttribute('data-room');
                const room = rooms.find(r => r.id === roomId);
                
                // Display room details (could be enhanced to show a modal with more info)
                alert(`
                    ${room.name}
                    Type: ${room.type.charAt(0).toUpperCase() + room.type.slice(1)}
                    Capacity: ${room.capacity} students
                    Features: ${room.features.join(', ')}
                `);
            });
        });
    } catch (error) {
        console.error('Error populating rooms:', error);
    }
}

async function initializeCalendar() {
    try {
        const reservations = await getReservations();
        const rooms = await getRooms();
        
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return null;
        
        const events = await generateCalendarEvents(reservations, rooms);
        
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            slotMinTime: '07:30:00',
            slotMaxTime: '22:00:00',
            allDaySlot: false,
            selectable: true,
            selectMirror: true,
            dayMaxEvents: true,
            events: events,
            select: function(info) {
                // Fill the reservation form with selected date and time
                const roomFilter = document.getElementById('room-filter').value;
                
                // Format the date for input date field (YYYY-MM-DD)
                const selectedDate = info.start.toISOString().split('T')[0];
                
                // Format the time for input time field (HH:MM)
                const selectedStartTime = info.start.toTimeString().slice(0, 5);
                const selectedEndTime = info.end.toTimeString().slice(0, 5);
                
                document.getElementById('reservation-date').value = selectedDate;
                document.getElementById('start-time').value = selectedStartTime;
                document.getElementById('end-time').value = selectedEndTime;
                
                // If a specific room is selected, pre-select it in the form
                if (roomFilter !== 'all') {
                    document.getElementById('room-select').value = roomFilter;
                }
                
                // Switch to the reservation tab
                const reservationBtn = document.querySelector('[data-bs-target="#new-reservation"]');
                reservationBtn.click();
            },
            eventClick: function(info) {
                const reservationId = parseInt(info.event.id);
                editReservation(reservationId);
            }
        });
        
        calendar.render();
        
        // Room Filter
        document.getElementById('room-filter').addEventListener('change', function() {
            const roomFilter = this.value;
            if (roomFilter === 'all') {
                calendar.getEvents().forEach(event => event.setProp('display', 'auto'));
            } else {
                calendar.getEvents().forEach(event => {
                    if (event.extendedProps.room === roomFilter) {
                        event.setProp('display', 'auto');
                    } else {
                        event.setProp('display', 'none');
                    }
                });
            }
        });

        return calendar; // Return the calendar instance
        
    } catch (error) {
        console.error('Error initializing calendar:', error);
        return null;
    }
}

async function editReservation(reservationId) {
    try {
        // Fetch the specific reservation by ID
        const response = await fetch(`${API_BASE_URL}?endpoint=reservations&id=${reservationId}`);
        const data = await response.json();
        
        if (!data || data.status !== 'success' || !data.data) {
            throw new Error(data.message || 'Failed to fetch reservation details');
        }
        
        const reservation = data.data;
        
        // Switch to the new reservation tab using the proper method
        const reservationBtn = document.querySelector('[data-bs-target="#new-reservation"]');
        reservationBtn.click();
        
        // Reset the form first
        document.getElementById('reservation-form').reset();
        document.getElementById('recurring-options').classList.add('d-none');
        
        // Fill the form with reservation data
        document.getElementById('room-select').value = reservation.room_id;
        document.getElementById('reservation-date').value = reservation.date;
        document.getElementById('start-time').value = reservation.start_time;
        document.getElementById('end-time').value = reservation.end_time;
        document.getElementById('reservation-purpose').value = reservation.purpose;
        
        // Handle recurring options
        if (reservation.is_recurring && reservation.recurrence_pattern) {
            document.getElementById('recurring-check').checked = true;
            document.getElementById('recurring-options').classList.remove('d-none');
            
            document.getElementById('repeat-frequency').value = reservation.recurrence_pattern.frequency || 1;
            document.getElementById('repeat-unit').value = reservation.recurrence_pattern.unit || 'week';
            document.getElementById('repeat-until').value = reservation.recurrence_pattern.endDate || '';
            
            // Reset day checkboxes
            document.querySelectorAll('.btn-check').forEach(checkbox => checkbox.checked = false);
            
            // Check the appropriate days
            if (reservation.recurrence_pattern.daysOfWeek) {
                reservation.recurrence_pattern.daysOfWeek.forEach(day => {
                    const dayCheckbox = document.getElementById(`day-${day}`);
                    if (dayCheckbox) dayCheckbox.checked = true;
                });
            }
        }
        
        // Change the submit button to update and show cancel button
        const submitButton = document.querySelector('#reservation-form button[type="submit"]');
        const cancelButton = document.getElementById('cancel-update');
        submitButton.textContent = 'Update Reservation';
        submitButton.setAttribute('data-edit-id', reservationId);
        
        // Show cancel button
        cancelButton.classList.remove('d-none');
        
        // Add cancel button event listener
        cancelButton.onclick = () => {
            // Reset form
            document.getElementById('reservation-form').reset();
            document.getElementById('recurring-options').classList.add('d-none');
            
            // Reset buttons
            submitButton.textContent = 'Complete Reservation';
            submitButton.removeAttribute('data-edit-id');
            cancelButton.classList.add('d-none');
            
            // Return to dashboard
            document.querySelector('[data-bs-target="#dashboard"]').click();
        };
    } catch (error) {
        console.error('Error editing reservation:', error);
        alert(`Error loading reservation details: ${error.message}`);
    }
}

function setupRoomFilters() {
    try {
        const capacityFilter = document.getElementById('capacity-filter');
        const featureFilter = document.getElementById('feature-filter');
        const typeFilter = document.getElementById('type-filter');
        
        if (!capacityFilter || !featureFilter || !typeFilter) {
            console.error('Filter elements not found');
            return;
        }
        
        const applyFilters = async () => {
            const capacityValue = capacityFilter.value;
            const featureValue = featureFilter.value;
            const typeValue = typeFilter.value;
            
            const rooms = await getRooms();
            const roomCards = document.querySelectorAll('.room-card');
            
            roomCards.forEach(card => {
                const roomElement = card.querySelector('[data-room]');
                if (!roomElement) return;
                
                const roomId = roomElement.getAttribute('data-room');
                const room = rooms.find(r => r.id === roomId);
                if (!room) return;
                
                let showRoom = true;
                
                // Filter by capacity
                if (capacityValue !== 'all') {
                    if (capacityValue === 'small' && room.capacity >= 30) showRoom = false;
                    if (capacityValue === 'medium' && (room.capacity < 30 || room.capacity > 60)) showRoom = false;
                    if (capacityValue === 'large' && room.capacity <= 60) showRoom = false;
                }
                
                // Filter by feature
                if (featureValue !== 'all') {
                    if (!room.features.includes(featureValue)) showRoom = false;
                }
                
                // Filter by type
                if (typeValue !== 'all') {
                    if (room.type !== typeValue) showRoom = false;
                }
                
                // Show or hide the room card
                card.parentElement.style.display = showRoom ? 'block' : 'none';
            });
        };
        
        capacityFilter.addEventListener('change', applyFilters);
        featureFilter.addEventListener('change', applyFilters);
        typeFilter.addEventListener('change', applyFilters);
    } catch (error) {
        console.error('Error setting up room filters:', error);
    }
}

function setupEventListeners() {
    // Toggle recurring options
    const recurringCheck = document.getElementById('recurring-check');
    if (recurringCheck) {
        recurringCheck.addEventListener('change', function() {
            const recurringOptions = document.getElementById('recurring-options');
            if (this.checked) {
                recurringOptions.classList.remove('d-none');
            } else {
                recurringOptions.classList.add('d-none');
            }
        });
    }
    
    // Quick Reservation Modal
    const reservationModal = document.getElementById('reservationModal');
    if (reservationModal) {
        reservationModal.addEventListener('show.bs.modal', function(event) {
            const button = event.relatedTarget;
            const roomNumber = button.getAttribute('data-room');
            const modalTitle = reservationModal.querySelector('#modal-room-number');
            modalTitle.textContent = roomNumber;
            
            // Set today's date as default
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('quick-date').value = today;
            
            // Set default times
            document.getElementById('quick-start-time').value = '09:00';
            document.getElementById('quick-end-time').value = '10:00';
        });
    }
    
    // Quick Reserve Button
    const quickReserveBtn = document.getElementById('quick-reserve-btn');
    if (quickReserveBtn) {
        quickReserveBtn.addEventListener('click', async function() {
            const roomId = document.getElementById('modal-room-number').textContent;
            const date = document.getElementById('quick-date').value;
            const startTime = document.getElementById('quick-start-time').value;
            const endTime = document.getElementById('quick-end-time').value;
            const purpose = document.getElementById('quick-purpose').value;
            
            if (!date || !startTime || !endTime || !purpose) {
                alert('Please fill all required fields');
                return;
            }
            
            try {
                // Check for scheduling conflicts
                const hasConflict = await hasSchedulingConflict(roomId, date, startTime, endTime);
                if (hasConflict) {
                    return;
                }
                
                // Create reservation
                const reservationData = {
                    roomId,
                    date,
                    startTime,
                    endTime,
                    purpose,
                    isRecurring: false
                };
                
                await saveReservation(reservationData);
                
                // Close modal
                const modalInstance = bootstrap.Modal.getInstance(reservationModal);
                modalInstance.hide();
                
                // Update UI
                await populateUpcomingReservations();
                await initializeCalendar();
                
                // Show success message
                alert('Reservation completed successfully!');
            } catch (error) {
                alert(`Error: ${error.message || 'Failed to create reservation'}`);
            }
        });
    }
    
    // Check Availability Button
    const checkAvailabilityBtn = document.getElementById('check-availability');
    if (checkAvailabilityBtn) {
        checkAvailabilityBtn.addEventListener('click', async function() {
            const roomId = document.getElementById('room-select').value;
            const date = document.getElementById('reservation-date').value;
            const startTime = document.getElementById('start-time').value;
            const endTime = document.getElementById('end-time').value;
            const submitButton = document.querySelector('#reservation-form button[type="submit"]');
            const editId = submitButton.getAttribute('data-edit-id');
            
            if (!roomId || !date || !startTime || !endTime) {
                alert('Please select a room, date, and time');
                return;
            }
            
            try {
                // Make API call to check for conflicts, including the current reservation ID if editing
                const response = await fetch(`${API_BASE_URL}?endpoint=reservations`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        roomId,
                        date,
                        startTime,
                        endTime,
                        purpose: 'conflict-check',
                        _checkOnly: true,
                        excludeId: editId ? parseInt(editId) : null
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'error') {
                    if (data.conflict) {
                        // Show conflict modal with the conflict data
                        await showConflictModal(data.conflict);
                    } else {
                        alert('The room is not available at this time.');
                    }
                } else if (data.status === 'success') {
                    alert('The room is available for the selected time slot!');
                } else {
                    alert('The room is not available at this time.');
                }
            } catch (error) {
                console.error('Error checking availability:', error);
                alert('Error checking availability. Please try again.');
            }
        });
    }
    
    // Submit Reservation Form
    const reservationForm = document.getElementById('reservation-form');
    if (reservationForm) {
        reservationForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitButton = document.querySelector('#reservation-form button[type="submit"]');
            const editId = submitButton.getAttribute('data-edit-id');
            
            const roomId = document.getElementById('room-select').value;
            const date = document.getElementById('reservation-date').value;
            const startTime = document.getElementById('start-time').value;
            const endTime = document.getElementById('end-time').value;
            const purpose = document.getElementById('reservation-purpose').value;
            const isRecurring = document.getElementById('recurring-check').checked;
            
            // Validate the form
            if (!roomId || !date || !startTime || !endTime || !purpose) {
                alert('Please fill all required fields');
                return;
            }
            
            try {
                // Check for scheduling conflicts using the API
                const response = await fetch(`${API_BASE_URL}?endpoint=reservations`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        roomId,
                        date,
                        startTime,
                        endTime,
                        purpose: 'conflict-check',
                        _checkOnly: true,
                        excludeId: editId ? parseInt(editId) : null
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'error') {
                    if (data.conflict) {
                        // Show conflict modal with the conflict data
                        await showConflictModal(data.conflict);
                        return;
                    } else {
                        alert('The room is not available at this time.');
                        return;
                    }
                }
                
                // If we get here, there are no conflicts, proceed with creating/updating reservation
                // Prepare recurrence data if applicable
                let recurrencePattern = null;
                if (isRecurring) {
                    const frequency = document.getElementById('repeat-frequency').value;
                    const unit = document.getElementById('repeat-unit').value;
                    const endDate = document.getElementById('repeat-until').value;
                    
                    // Get selected days
                    const daysOfWeek = [];
                    if (document.getElementById('day-mon').checked) daysOfWeek.push('mon');
                    if (document.getElementById('day-tue').checked) daysOfWeek.push('tue');
                    if (document.getElementById('day-wed').checked) daysOfWeek.push('wed');
                    if (document.getElementById('day-thu').checked) daysOfWeek.push('thu');
                    if (document.getElementById('day-fri').checked) daysOfWeek.push('fri');
                    
                    recurrencePattern = {
                        frequency,
                        unit,
                        endDate,
                        daysOfWeek
                    };
                }
                
                // Create reservation data
                const reservationData = {
                    roomId,
                    date,
                    startTime,
                    endTime,
                    purpose,
                    isRecurring,
                    recurrencePattern
                };
                
                // If editing, update the reservation
                let success = false;
                if (editId) {
                    success = await updateReservation(parseInt(editId), reservationData);
                    // Reset form
                    submitButton.textContent = 'Complete Reservation';
                    submitButton.removeAttribute('data-edit-id');
                } else {
                    // Save the new reservation
                    await saveReservation(reservationData);
                    success = true;
                }
                
                if (success) {
                    // Reset the form
                    this.reset();
                    document.getElementById('recurring-options').classList.add('d-none');
                    
                    // Update UI
                    await populateUpcomingReservations();
                    await initializeCalendar();
                    
                    // Show success message
                    alert(editId ? 'Reservation updated successfully!' : 'Reservation completed successfully!');
                    
                    // Return to dashboard
                    document.querySelector('[data-bs-target="#dashboard"]').click();
                } else {
                    alert('An error occurred. Please try again.');
                }
            } catch (error) {
                alert(`Error: ${error.message || 'Failed to process reservation'}`);
            }
        });
    }
}

// Helper function to generate calendar events
async function generateCalendarEvents(reservations, rooms) {
    return reservations.map(reservation => {
        const room = rooms.find(r => r.id === reservation.roomId) || { name: 'Unknown Room', type: 'lecture' };
        
        // Set color based on room type
        let backgroundColor;
        switch (room.type) {
            case 'lecture': backgroundColor = '#28a745'; break;
            case 'lab': backgroundColor = '#fd7e14'; break;
            case 'exam': backgroundColor = '#dc3545'; break;
            default: backgroundColor = '#0d6efd';
        }
        
        return {
            id: reservation.id,
            title: `${reservation.purpose} (${room.name})`,
            start: `${reservation.date}T${reservation.startTime}`,
            end: `${reservation.date}T${reservation.endTime}`,
            extendedProps: {
                room: reservation.roomId,
                purpose: reservation.purpose
            },
            backgroundColor: backgroundColor,
            borderColor: backgroundColor
        };
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    let calendarInstance = null; // Store calendar instance globally
    
    // Add tab navigation functionality
    document.querySelectorAll('.sidebar button').forEach(button => {
        button.addEventListener('click', async function() {
            // Remove active class from all buttons
            document.querySelectorAll('.sidebar button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Hide all tab panes
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });
            
            // Show the target tab pane
            const targetId = this.getAttribute('data-bs-target');
            const targetPane = document.querySelector(targetId);
            if (targetPane) {
                targetPane.classList.add('show', 'active');
                
                // Refresh calendar when switching to calendar tab
                if (targetId === '#calendar') {
                    if (calendarInstance) {
                        // Fetch latest events
                        const reservations = await getReservations();
                        const rooms = await getRooms();
                        const events = await generateCalendarEvents(reservations, rooms);
                        
                        // Remove all events and add updated ones
                        calendarInstance.removeAllEvents();
                        calendarInstance.addEventSource(events);
                        calendarInstance.render();
                    }
                }
            }
        });
    });

    try {
        // Initial load
        await populateUpcomingReservations();
        await populateRoomsList();
        calendarInstance = await initializeCalendar(); // Store the calendar instance
        setupEventListeners();
        setupRoomFilters();

        // Set up auto-refresh for dashboard and calendarr
        const refreshViews = async () => {
            const dashboardActive = document.querySelector('#dashboard').classList.contains('active');
            const calendarActive = document.querySelector('#calendar').classList.contains('active');
            
            if (dashboardActive) {
                await updateDashboardStats();
                await populateUpcomingReservations();
            }
            
            if (calendarActive && calendarInstance) {
                const reservations = await getReservations();
                const rooms = await getRooms();
                const events = await generateCalendarEvents(reservations, rooms);
                
                calendarInstance.removeAllEvents();
                calendarInstance.addEventSource(events);
                calendarInstance.render();
            }
        };

        // Refresh every 30 seconds
        setInterval(refreshViews, 30000);
        
        console.log('Classroom Reservation System initialized successfully');
    } catch (error) {
        console.error('Error initializing application:', error);
    }
});
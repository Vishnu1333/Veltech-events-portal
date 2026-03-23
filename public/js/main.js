/* public/js/main.js */
const API_URL = '/api';

// Utility for formatting dates
function formatDate(dateStr) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString(undefined, options);
}

// Fetch all events
async function fetchEvents(limit = 0, containerId = 'events-grid') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center;width:100%;grid-column: 1 / -1;">Loading events...</div>';
    
    try {
        const response = await fetch(`${API_URL}/events`);
        let events = await response.json();
        
        // Store for filtering
        window.allEvents = events;
        
        if (limit > 0) {
            events = events.slice(0, limit);
        }
        
        renderEvents(events, containerId);
    } catch (error) {
        console.error('Error fetching events:', error);
        container.innerHTML = '<div style="text-align:center;width:100%;color:red;grid-column: 1 / -1;">Failed to load events. Is the backend running?</div>';
    }
}

// Render events to grid
function renderEvents(events, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (events.length === 0) {
        container.innerHTML = '<div style="text-align:center;width:100%;grid-column: 1 / -1;padding:3rem;">No events found. Check back later!</div>';
        return;
    }
    
    container.innerHTML = events.map(event => `
        <div class="event-card reveal">
            <img src="${event.image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=500&q=80'}" alt="${event.title}" class="event-image" onerror="this.src='https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=500&q=80'">
            <div class="event-content">
                <span class="event-category">${event.category}</span>
                <h3 class="event-title">${event.title}</h3>
                <div class="event-meta">
                    <div><i class="far fa-calendar-alt"></i> ${formatDate(event.date)} at ${event.time.substring(0,5)}</div>
                    <div><i class="fas fa-map-marker-alt"></i> ${event.location}</div>
                    <div><i class="fas fa-users"></i> Seats Left: ${event.available_seats} / ${event.total_seats}</div>
                </div>
                <a href="/event-details.html?id=${event.id}" class="btn-block">View Details & Register</a>
            </div>
        </div>
    `).join('');
    
    // Re-initialize animations for new cards
    setTimeout(initScrollAnimations, 50);
}

// Filter events by category
function filterEvents(category) {
    if (!window.allEvents) return;
    let filtered = window.allEvents;
    if (category !== 'all') {
        filtered = window.allEvents.filter(e => e.category === category);
    }
    renderEvents(filtered, 'events-grid');
}

// Search events
function searchEvents(query) {
    if (!window.allEvents) return;
    if (!query.trim()) {
        const activeBtn = document.querySelector('.filter-btn.active');
        const cat = activeBtn ? activeBtn.dataset.category : 'all';
        filterEvents(cat);
        return;
    }
    const lowerQuery = query.toLowerCase();
    const filtered = window.allEvents.filter(e => 
        e.title.toLowerCase().includes(lowerQuery) || 
        e.location.toLowerCase().includes(lowerQuery) ||
        (e.speaker && e.speaker.toLowerCase().includes(lowerQuery))
    );
    renderEvents(filtered, 'events-grid');
}

// Load Event Details
async function loadEventDetails() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (!id) {
        document.getElementById('loading').textContent = 'Event not specified.';
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/events/${id}`);
        if (!response.ok) throw new Error('Event not found');
        const event = await response.json();
        
        document.getElementById('d-image').src = event.image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80';
        document.getElementById('d-category').textContent = event.category;
        document.getElementById('d-title').textContent = event.title;
        document.getElementById('d-datetime').textContent = `${formatDate(event.date)} at ${event.time.substring(0,5)}`;
        document.getElementById('d-location').textContent = event.location;
        document.getElementById('d-speaker').textContent = event.speaker || 'TBA';
        document.getElementById('d-seats').textContent = `${event.available_seats} / ${event.total_seats}`;
        document.getElementById('d-desc').textContent = event.description;
        
        const registerBtn = document.getElementById('d-register-btn');
        if (event.available_seats > 0) {
             registerBtn.href = `/register-event.html?id=${event.id}&title=${encodeURIComponent(event.title)}`;
             registerBtn.textContent = 'Register Now';
        } else {
             registerBtn.href = '#';
             registerBtn.textContent = 'Seats Full';
             registerBtn.style.background = 'var(--gray-text)';
             registerBtn.style.pointerEvents = 'none';
        }
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('details-container').style.display = 'block';
    } catch (error) {
        document.getElementById('loading').textContent = 'Error loading event details.';
    }
}

// Handle Registration
async function handleRegistration(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    const alertBox = document.getElementById('register-alert');
    if (!data.event_id) {
        alertBox.className = 'alert error';
        alertBox.innerHTML = `<strong>Error!</strong> No event selected.`;
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alertBox.className = 'alert success';
            alertBox.innerHTML = `<strong>Success!</strong> ${result.message}. Your Registration ID is: <strong>${result.registration_id}</strong>`;
            e.target.reset();
            // Scroll to alert
            alertBox.scrollIntoView({ behavior: 'smooth' });
        } else {
            alertBox.className = 'alert error';
            alertBox.innerHTML = `<strong>Error!</strong> ${result.error}`;
        }
    } catch (error) {
        alertBox.className = 'alert error';
        alertBox.innerHTML = `<strong>Error!</strong> Failed to connect to server.`;
    }
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const alertBox = document.getElementById('login-alert');
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('user', JSON.stringify(result.user));
            if (result.user.role === 'admin') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/events.html';
            }
        } else {
            alertBox.className = 'alert error';
            alertBox.textContent = result.error;
            alertBox.style.display = 'block';
        }
    } catch (error) {
        alertBox.className = 'alert error';
        alertBox.textContent = 'Login request failed.';
        alertBox.style.display = 'block';
    }
}

// Admin Functions
async function loadAdminEvents() {
    const tbody = document.getElementById('admin-events-list');
    try {
        const response = await fetch(`${API_URL}/events`);
        const events = await response.json();
        
        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No events found. Create one!</td></tr>';
            return;
        }

        tbody.innerHTML = events.map(e => `
            <tr>
                <td>${e.id}</td>
                <td>${e.title}</td>
                <td>${formatDate(e.date)}</td>
                <td>${e.category}</td>
                <td>${e.available_seats} / ${e.total_seats}</td>
                <td>
                    <button class="action-btn btn-delete" onclick="deleteEvent(${e.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">Failed to load events.</td></tr>';
    }
}

async function loadAdminRegistrations() {
    const tbody = document.getElementById('admin-registrations-list');
    try {
        const response = await fetch(`${API_URL}/registrations`);
        const registrations = await response.json();
        
        if (registrations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No registrations found yet.</td></tr>';
            return;
        }

        tbody.innerHTML = registrations.map(r => `
            <tr>
                <td>${r.registration_id}</td>
                <td>${r.name}<br><small style="color:var(--gray-text)">${r.email}</small></td>
                <td>${r.event_title}</td>
                <td>${r.department || '-'} / ${r.year || '-'}</td>
                <td>${new Date(r.registration_date).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5">Failed to load registrations.</td></tr>';
    }
}

async function handleAddEvent(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const alertBox = document.getElementById('add-event-alert');
    
    try {
        const response = await fetch(`${API_URL}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alertBox.className = 'alert success';
            alertBox.textContent = 'Event created successfully!';
            e.target.reset();
            loadAdminEvents();
            setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
        } else {
            const result = await response.json();
            alertBox.className = 'alert error';
            alertBox.textContent = result.error || 'Failed to create event';
        }
    } catch (error) {
        alertBox.className = 'alert error';
        alertBox.textContent = 'Network error while creating event.';
    }
}

async function deleteEvent(id) {
    if(!confirm('Are you sure you want to delete this event? This will also delete related registrations.')) return;
    try {
        const response = await fetch(`${API_URL}/events/${id}`, { method: 'DELETE' });
        if(response.ok) {
            loadAdminEvents(); // refresh list
        } else {
            alert('Failed to delete event');
        }
    } catch (error) {
        alert('Server error occurred');
    }
}

// --- Apple-like Scroll Animations ---
function initScrollAnimations() {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Optional: Stop observing once revealed to keep it visible
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    reveals.forEach(reveal => {
        observer.observe(reveal);
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initScrollAnimations);

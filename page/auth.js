// Professional Authentication System with Backend API
class AuthSystem {
    constructor() {
        this.isLoggedIn = false;
        this.currentUser = null;
        this.apiUrl = 'http://localhost:4000/api';
        this.token = localStorage.getItem('authToken');
        this.init();
    }

    async init() {
        // Check if user has valid token
        if (this.token) {
            await this.verifyToken();
        }

        this.bindEvents();
        this.setupRestrictedLinks();
    }

    async verifyToken() {
        try {
            const response = await fetch(`${this.apiUrl}/verify-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: this.token })
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.isLoggedIn = true;
                this.updateUI();
            } else {
                // Token invalid, remove it
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                this.token = null;
            }
        } catch (error) {
            console.error('Error verifying token:', error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            this.token = null;
        }
    }

    bindEvents() {
        const authBtn = document.getElementById('authBtn');
        const membershipBtn = document.getElementById('membershipBtn');
        const footerContactBtn = document.getElementById('footerContactBtn');
        const footerContactFormBtn = document.getElementById('footerContactFormBtn');
        const loginModal = document.getElementById('loginModal');
        const registerModal = document.getElementById('registerModal');
        const contactModal = document.getElementById('contactModal');
        const closeButtons = document.querySelectorAll('.close');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const joinForm = document.getElementById('joinForm');
        const contactForm = document.getElementById('contactForm');
        const showLoginFromReg = document.getElementById('showLoginFromReg');
        const signOffBtn = document.getElementById('signOffBtn');

        // Auth button click (Connexion/Faire un cadeau)
        authBtn.addEventListener('click', () => {
            if (this.isLoggedIn) {
                // Navigate to gift page
                window.location.href = 'give.html';
            } else {
                this.showLoginModal();
            }
        });

        // Footer contact buttons click
        if (footerContactBtn) {
            footerContactBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showContactModal();
            });
        }

        if (footerContactFormBtn) {
            footerContactFormBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showContactModal();
            });
        }

        // Sign off button click
        if (signOffBtn) {
            signOffBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Membership button click (Membership/Sign off)
        if (membershipBtn) {
            membershipBtn.addEventListener('click', (e) => {
                if (this.isLoggedIn) {
                    e.preventDefault();
                    this.logout();
                } else {
                    // Let the default behavior scroll to #join section
                    // Don't show registration modal
                }
            });
        }

        // Close modals
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.hideModal(modal);
            });
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal(e.target);
            }
        });

        // Switch between login and register modals
        if (showLoginFromReg) {
            showLoginFromReg.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideModal(registerModal);
                this.showLoginModal();
            });
        }

        // Login form submission
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin(e);
            });
        }

        // Register form submission
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister(e);
            });
        }

        // Join form submission
        if (joinForm) {
            joinForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleJoinSubmission(e);
            });
        }

        // Contact form submission
        if (contactForm) {
            contactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleContactSubmission(e);
            });
        }

        // Add register button to join form
        this.addRegisterButton();
    }

    setupRestrictedLinks() {
        const restrictedLinks = document.querySelectorAll('.restricted-link');
        
        restrictedLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (!this.isLoggedIn) {
                    // Prevent navigation and show access denied message
                    e.preventDefault();
                    this.showAccessDeniedMessage();
                    setTimeout(() => {
                        document.getElementById('join').scrollIntoView({ 
                            behavior: 'smooth' 
                        });
                    }, 1000);
                } else {
                    // User is logged in, allow normal navigation
                    // Don't prevent default - let the link work normally
                    console.log(`✅ Accès autorisé à: ${link.href}`);
                }
            });
        });
    }

    showLoginModal() {
        const modal = document.getElementById('loginModal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    showRegisterModal() {
        const modal = document.getElementById('registerModal');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    showContactModal() {
        const modal = document.getElementById('contactModal');
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }

    hideModal(modal) {
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    addRegisterButton() {
        // Remove the quick register button functionality
        // Only keep the main "Envoyer la demande" button
    }

    async handleLogin(e) {
        const formData = new FormData(e.target);
        const email = formData.get('email').toLowerCase().trim();
        const password = formData.get('password');

        try {
            const response = await fetch(`${this.apiUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.login(data.user, data.token);
                this.hideModal(document.getElementById('loginModal'));
                this.showSuccessMessage(`Connexion réussie! Bienvenue ${data.user.nom}.`);
                e.target.reset();
            } else {
                this.showErrorMessage(data.error || 'Erreur de connexion');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showErrorMessage('Erreur de connexion au serveur');
        }
    }

    async registerUser(userData) {
        try {
            const response = await fetch(`${this.apiUrl}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok) {
                return { success: true, user: data.user, token: data.token };
            } else {
                return { success: false, message: data.error || 'Erreur d\'inscription' };
            }
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    }

    login(user, token) {
        this.isLoggedIn = true;
        this.currentUser = user;
        this.token = token;
        localStorage.setItem('authToken', token);
        this.updateUI();
    }

    logout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('authToken');
        this.updateUI();
        this.showSuccessMessage('Déconnexion réussie. À bientôt!');
    }

    updateUI() {
        const authBtn = document.getElementById('authBtn');
        const membershipLink = document.querySelector('a[href="#join"]');
        const restrictedLinks = document.querySelectorAll('.restricted-link');

        if (this.isLoggedIn) {
            authBtn.textContent = 'Faire un Cadeau';
            authBtn.title = `Connecté en tant que ${this.currentUser.nom}`;
            
            // Change Membership to Sign off
            if (membershipLink) {
                membershipLink.textContent = 'Sign off';
                membershipLink.href = '#';
                membershipLink.onclick = (e) => {
                    e.preventDefault();
                    this.logout();
                };
            }
            
            // Remove restricted styling
            restrictedLinks.forEach(link => {
                link.classList.remove('restricted');
            });
        } else {
            authBtn.textContent = 'Connexion';
            authBtn.title = 'Se connecter à la communauté';
            
            // Reset Membership link
            if (membershipLink) {
                membershipLink.textContent = 'Membership';
                membershipLink.href = '#join';
                membershipLink.onclick = null;
            }
            
            // Add restricted styling
            restrictedLinks.forEach(link => {
                link.classList.add('restricted');
            });
        }
    }

    async handleJoinSubmission(e) {
        const formData = new FormData(e.target);
        const userData = {
            nom: formData.get('nom'),
            email: formData.get('email'),
            promo: formData.get('promo'),
            linkedin: formData.get('linkedin'),
            motivation: formData.get('motivation')
        };

        // Validate required fields
        if (!userData.nom || !userData.email || !userData.promo) {
            this.showErrorMessage('Veuillez remplir tous les champs obligatoires.');
            return;
        }

        // Check if user is eligible (promotion 2022-2025)
        const eligiblePromos = ['2022', '2023', '2024', '2025'];
        if (!eligiblePromos.includes(userData.promo)) {
            this.showErrorMessage('Désolé, seules les promotions 2022-2025 sont actuellement acceptées.');
            return;
        }

        try {
            // Submit membership request to database
            const response = await fetch(`${this.apiUrl}/membership-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccessMessage(data.message);
                // Reset form
                e.target.reset();
            } else {
                this.showErrorMessage(data.message || 'Erreur lors de l\'envoi de la demande');
            }
        } catch (error) {
            console.error('Error submitting membership request:', error);
            this.showErrorMessage('Erreur de connexion au serveur');
        }
    }

    async handleRegister(e) {
        const formData = new FormData(e.target);
        const userData = {
            nom: formData.get('nom'),
            email: formData.get('email'),
            password: formData.get('password'),
            promo: formData.get('promo')
        };

        // Validate required fields
        if (!userData.nom || !userData.email || !userData.password || !userData.promo) {
            this.showErrorMessage('Veuillez remplir tous les champs obligatoires.');
            return;
        }

        if (userData.password.length < 6) {
            this.showErrorMessage('Le mot de passe doit contenir au moins 6 caractères.');
            return;
        }

        const result = await this.registerUser(userData);
        
        if (result.success) {
            this.hideModal(document.getElementById('registerModal'));
            this.showSuccessMessage(`Compte créé avec succès! Bienvenue ${userData.nom}.`);
            
            // Auto-login the user
            setTimeout(() => {
                this.login(result.user, result.token);
            }, 1000);
            
            // Reset form
            e.target.reset();
        } else {
            this.showErrorMessage(result.message);
        }
    }

    updateUI() {
        const authBtn = document.getElementById('authBtn');
        const membershipBtn = document.getElementById('membershipBtn');
        const signOffBtn = document.getElementById('signOffBtn');
        const authOnlyElements = document.querySelectorAll('.auth-only');
        
        if (this.isLoggedIn) {
            // Update auth button: Connexion -> Faire un cadeau
            if (authBtn) {
                authBtn.textContent = 'Faire un cadeau';
                authBtn.classList.add('logged-in');
            }
            
            // Update membership button: Membership -> Sign off
            if (membershipBtn) {
                membershipBtn.textContent = 'Sign off';
                membershipBtn.classList.add('logout-btn');
                membershipBtn.href = '#';
            }
            
            // Show auth-only elements (like "Faire un cadeau" link and "Déconnexion" button)
            authOnlyElements.forEach(element => {
                element.style.display = '';
            });
            
            // Hide the main auth button and show sign off button if it exists
            if (authBtn && signOffBtn) {
                authBtn.style.display = 'none';
                signOffBtn.style.display = '';
            }
        } else {
            // Reset to default state
            if (authBtn) {
                authBtn.textContent = 'Connexion';
                authBtn.classList.remove('logged-in');
                authBtn.style.display = '';
            }
            
            if (membershipBtn) {
                membershipBtn.textContent = 'Membership';
                membershipBtn.classList.remove('logout-btn');
                membershipBtn.href = '#join';
            }
            
            // Hide auth-only elements
            authOnlyElements.forEach(element => {
                element.style.display = 'none';
            });
            
            // Show main auth button and hide sign off button
            if (signOffBtn) {
                signOffBtn.style.display = 'none';
            }
        }
    }

    login(user, token) {
        this.currentUser = user;
        this.isLoggedIn = true;
        this.token = token;
        
        // Store token in localStorage
        localStorage.setItem('authToken', token);
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        this.updateUI();
        this.showSuccessMessage(`Bienvenue ${user.nom}!`);
        
        // Déclencher l'événement de connexion pour la galerie
    }

    logout() {
        // Clear all stored data
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Reset state
        this.currentUser = null;
        this.isLoggedIn = false;
        this.token = null;
        
        this.updateUI();
        this.showSuccessMessage('Vous avez été déconnecté avec succès.');
        
        // Déclencher l'événement de déconnexion pour la galerie
    }

    showLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    showRegisterModal() {
        const modal = document.getElementById('registerModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hideModal(modal) {
        if (modal) {
            modal.style.display = 'none';
        }
    }

    navigateToPage(page) {
        // In a real application, this would navigate to actual pages
        this.showSuccessMessage(`Accès autorisé à la page: ${page}`);
        console.log(`Navigating to: ${page}`);
    }

    showAccessDeniedMessage() {
        this.showNotification(
            'Accès restreint', 
            'Vous devez être membre pour accéder à cette section. Rejoignez notre communauté ci-dessous!',
            'warning'
        );
    }

    showSuccessMessage(message) {
        this.showNotification('Succès', message, 'success');
    }

    showErrorMessage(message) {
        this.showNotification('Erreur', message, 'error');
    }

    showNotification(title, message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
            <button class="notification-close">&times;</button>
        `;

        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#ff9800'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10001;
            max-width: 400px;
            animation: slideInRight 0.3s ease;
        `;

        // Add to page
        document.body.appendChild(notification);

        // Close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
}

// Initialize authentication system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authSystem = new AuthSystem();
});

// Add notification animation styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .notification-content h4 {
        margin: 0 0 8px 0;
        font-size: 16px;
    }
    
    .notification-content p {
        margin: 0;
        font-size: 14px;
        line-height: 1.4;
    }
    
    .notification-close {
        position: absolute;
        top: 8px;
        right: 12px;
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .notification-close:hover {
        opacity: 0.8;
    }
`;
document.head.appendChild(notificationStyles);

// Global function to close contact modal
function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Add contact form submission handler to AuthSystem
AuthSystem.prototype.handleContactSubmission = async function(e) {
    const formData = new FormData(e.target);
    const contactData = {
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message')
    };

    // Validate required fields
    if (!contactData.name || !contactData.email || !contactData.subject || !contactData.message) {
        this.showErrorMessage('Veuillez remplir tous les champs obligatoires.');
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactData.email)) {
        this.showErrorMessage('Veuillez entrer une adresse email valide.');
        return;
    }

    try {
        // In a real application, this would send to a backend API
        // For now, we'll simulate the submission
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        this.showSuccessMessage('Votre message a été envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.');
        this.hideModal(document.getElementById('contactModal'));
        e.target.reset();
        
    } catch (error) {
        console.error('Error submitting contact form:', error);
        this.showErrorMessage('Erreur lors de l\'envoi du message. Veuillez réessayer.');
    }
};

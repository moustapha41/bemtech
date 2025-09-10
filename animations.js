// Animations and Interactive Effects for Alumni Website

// Confetti Animation
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
});

const confettiCount = 150;
const confettis = [];

function random(min, max) {
    return Math.random() * (max - min) + min;
}

for(let i=0; i<confettiCount; i++){
    confettis.push({
        x: random(0, W),
        y: random(-H, 0),
        r: random(5,12),
        d: random(10,30),
        color: `hsl(${random(0, 360)}, 70%, 60%)`,
        tilt: random(-10,10),
        tiltAngle: 0,
        tiltAngleIncrement: random(0.05,0.12)
    });
}

function draw() {
    ctx.clearRect(0,0,W,H);
    confettis.forEach(c => {
        ctx.beginPath();
        ctx.lineWidth = c.r/2;
        ctx.strokeStyle = c.color;
        ctx.moveTo(c.x + c.tilt + c.r/4, c.y);
        ctx.lineTo(c.x + c.tilt, c.y + c.tilt + c.r/2);
        ctx.stroke();
    });
}

function update() {
    confettis.forEach(c => {
        c.tiltAngle += c.tiltAngleIncrement;
        c.y += (Math.cos(c.d) + 3 + c.r/2)/2;
        c.tilt = Math.sin(c.tiltAngle) * 15;
    });
}

window.addEventListener('load', () => {
    let start = null;
    function animate(timestamp) {
        if(!start) start = timestamp;
        const progress = timestamp - start;
        if(progress < 7000) {
            draw();
            update();
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0,0,W,H);
        }
    }
    requestAnimationFrame(animate);
});

// Hero Message Animation
window.addEventListener("load", () => {
    const msg = document.getElementById("timedMessage");

    // Afficher le message immédiatement
    msg.classList.remove("hide");
    msg.classList.add("show");
});

// Smooth scroll pour tous les liens d'ancrage
document.addEventListener('DOMContentLoaded', function() {
    // Sélectionner tous les liens qui pointent vers des ancres
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add intersection observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.quick-item, .visual-card, .networks-container');
    animateElements.forEach(el => observer.observe(el));
});

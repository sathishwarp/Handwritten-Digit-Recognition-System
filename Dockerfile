FROM nginx:alpine

# Copy static website files
COPY index.html style.css main.js /usr/share/nginx/html/

# Copy pre-built TensorFlow.js model (no retraining needed)
COPY tfjs_model/ /usr/share/nginx/html/tfjs_model/

# Use nginx templates for dynamic PORT substitution (Render sets $PORT)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Render uses PORT env variable, default to 10000
ENV PORT=10000
EXPOSE ${PORT}

CMD ["nginx", "-g", "daemon off;"]

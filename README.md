# Bot Tickets - DISTRICT FA

Bot Discord en `discord.js` pour creer des tickets depuis un panel serveur avec selecteur.

## Installation

```bash
npm install
```

Copie `.env.example` en `.env`, puis remplis :

- `DISCORD_TOKEN` : token du bot
- `GUILD_ID` : ID du serveur Discord
- `TICKET_LOG_CHANNEL_ID` : salon de logs optionnel

Copie `config.example.json` en `config.json`, puis remplis :

- `status` : activite du bot
- `defaultCategory` : type utilise pour tester la config
- `panel` : apparence par defaut du panel
- `categories.*.roleIds` : roles staff autorises a voir chaque type de ticket

## Lancement

```bash
npm start
```

Au demarrage, le bot enregistre la commande slash :

```text
/ticket-panel
```

Utilise cette commande sur ton serveur pour choisir :

- le salon ou envoyer le panel
- le titre du panel
- la description du panel

La couleur, le footer, le placeholder et les autres details visuels se reglent dans `config.json`.
Chaque type de ticket utilise sa propre `ticketCategoryId` dans `config.json`.

## Fonctionnement

- Un membre choisit un type de ticket dans le selecteur du panel.
- Le bot cree un salon prive dans la categorie Discord configuree pour ce type.
- Les roles configures pour ce type sont ping automatiquement dans le ticket.
- Le salon ticket contient un panel staff avec les boutons `Claim`, `Rediriger`, `Fermer` et `Supprimer`.
- Le bouton `Rediriger` ouvre un selecteur staff pour changer le type du ticket et deplacer le salon.
- Le bouton `Fermer` bloque l'envoi de messages au membre et affiche un bouton `Reouvrir`.

## Permissions Discord

Le bot doit avoir :

- Voir les salons
- Envoyer des messages
- Gerer les salons
- Lire l'historique
- Gerer les permissions

Active aussi `Message Content Intent` dans le portail Discord Developer si tu veux lire le contenu des messages plus tard.

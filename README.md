# Backup Bot (style Xenon)

Bot Discord pour creer et restaurer des backups de serveur (roles + salons + quelques reglages).

## Installation

1. Create your bot on discord developer 
2. Mettre ton token dans `DISCORD_TOKEN`
3. Installer les dependances:
   - `npm install`
4. Lancer:
   - `npm start`

## Permissions requises

- Le bot doit avoir un role place au-dessus des roles qu'il doit gerer.
- Permissions conseillees:
  - Administrateur
  - Gerer les roles
  - Gerer les salons
  - Lire / ecrire les messages

## Commandes

- `!backup create` : cree un backup du serveur
- `!backup list` : liste les backups du serveur
- `!backup load <backupId>` : restaure un backup
- `!backup delete <backupId>` : supprime un backup
- `!backup sysperms <backupId>` : Permmissions salons
- `!backup permssave` : Backup perms salons
- `!backup syncperms <backupId>` : Sync permissions salons
- `!backup permsload <backupId>` : Restaurer perms salons
- `!backup help ou !help ` : aide 

## Notes importantes

- La restauration supprime les salons et roles que le bot peut supprimer avant de recreer la structure.
- Les backups sont stockes localement dans le dossier `backups/`.
- Certaines limites Discord peuvent empecher de reproduire 100% a l'identique.

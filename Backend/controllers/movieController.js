const Movie = require('../models/Movie');

exports.getMovies = async (_req, res) => {
  try {
    const movies = await Movie.find({ expiresAt: { $gte: new Date() } }).sort({ expiresAt: 1 });
    return res.json(movies);
  } catch (error) {
    console.error('Get movies error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

exports.createMovie = async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const genre = String(req.body.genre || '').trim();
    const duration = String(req.body.duration || '').trim();
    const showDate = String(req.body.showDate || '').trim();
    const showTime = String(req.body.showTime || '').trim();
    const status = req.body.status === 'Coming Soon' ? 'Coming Soon' : 'Now Showing';

    if (!title || !genre || !duration || !/^\d{4}-\d{2}-\d{2}$/.test(showDate) || !/^\d{2}:\d{2}$/.test(showTime)) {
      return res.status(400).json({ message: 'Complete all movie and show-time fields.' });
    }

    const offset = process.env.SHOW_TIMEZONE_OFFSET || '+05:30';
    const expiresAt = new Date(`${showDate}T${showTime}:00${offset}`);
    if (Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ message: 'Invalid show date/time.' });
    }
    if (expiresAt <= new Date()) {
      return res.status(400).json({ message: 'Show time must be in the future.' });
    }

    const movie = await Movie.create({
      title,
      genre,
      duration,
      posterUrl: req.file?.path || '',
      status,
      showDate,
      showTime,
      expiresAt,
      addedBy: req.user._id,
    });

    return res.status(201).json(movie);
  } catch (error) {
    console.error('Create movie error:', error);
    return res.status(400).json({ message: 'Invalid movie data or poster upload configuration.' });
  }
};

exports.deleteMovie = async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    await movie.deleteOne();
    return res.json({ message: 'Movie removed successfully.' });
  } catch (error) {
    console.error('Delete movie error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
